import { cn } from "shared/lib/utils";
import { BackIcon, CloseIcon, HintIcon, MotionIcon, PlayIcon, PlusIcon, RestartIcon, ThreadIcon } from "shared/ui/spool-icons";
import { SpoolMark } from "shared/ui/spool-mark";

const colors = [
	["bg", "0E0E0E"],
	["canvas", "161616"],
	["surface", "1C1C1C"],
	["raised", "282828"],
	["border", "262626"],
	["border-raised", "363636"],
	["text", "F0EFED"],
	["muted", "8E8C88"],
	["thread", "F5391A"],
	["on-thread", "FFFFFF"],
] as const;

const laws = [
	"Chrome is monochrome. Color appears only where meaning is: the thread, selection, the active state.",
	"Frames glow, chrome recedes. Nothing in the shell may compete with a prototype.",
	"Names, numbers and readouts are mono, because frame names are folder names.",
	"Everything sits on the 4px grid. Hairlines separate surfaces, never shadows.",
	"The canvas color is a per-project preference. The system must survive any canvas tint.",
] as const;

export function SpoolSystem() {
	return (
		<div className="flex min-h-full w-full flex-col gap-[52px] overflow-hidden bg-bg p-16 font-sans text-text antialiased [font-synthesis:none]">
			<header className="flex flex-col gap-2.5">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-[22px] w-[17px] text-thread" />
					<h1 className="text-[20px] font-semibold tracking-tight leading-6">spool system</h1>
				</div>
				<p className="text-base text-muted leading-base">
					Röda tråden, dark. This page is the core everything depends on. Read it before designing any screen; use
					the file tokens, never raw values.
				</p>
			</header>

			<section className="flex flex-col gap-4">
				<SectionTitle>colors</SectionTitle>
				<div className="flex gap-4">
					{colors.map(([name, value]) => (
						<div key={name} className="flex w-[107px] shrink-0 flex-col gap-2">
							<div
								className="h-16 w-[107px] rounded-md border border-border"
								style={{ backgroundColor: `var(--color-${name})` }}
							/>
							<span className={cn("font-mono text-xs leading-xs", name === "thread" && "text-thread")}>
								{name}
							</span>
							<span className="font-mono text-[10px] text-muted leading-3">{value}</span>
						</div>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<SectionTitle>type</SectionTitle>
				<div className="flex gap-28">
					<div className="flex w-[560px] flex-col gap-1.5">
						<div className="text-[28px] font-semibold tracking-tight leading-[34px]">Familjen Grotesk</div>
						<div className="text-lg leading-md">AaBbÅäÖö 0123456789</div>
						<div className="font-mono text-muted text-xs leading-xs">
							--font-sans · UI voice · 400 / 500 / 600
						</div>
					</div>
					<div className="flex w-[560px] flex-col gap-1.5 font-mono">
						<div className="text-[28px] leading-[34px]">Fragment Mono</div>
						<div className="text-lg leading-md">AaBbÅäÖö 0123456789</div>
						<div className="text-muted text-xs leading-xs">
							--font-mono · readouts, frame names, numbers · 400 only
						</div>
					</div>
				</div>
				<div className="flex flex-col gap-1.5 pt-1">
					<TypeRow
						sample="Din varukorg"
						spec="--text-lg · 18/26 · 600 · dialog titles, empty states"
						className="text-lg font-semibold leading-lg"
					/>
					<TypeRow
						sample="Din varukorg"
						spec="--text-md · 14/22 · 600 · wordmark, panel titles"
						className="text-md font-semibold leading-md"
					/>
					<TypeRow
						sample="Din varukorg"
						spec="--text-base · 13/20 · 400–600 · tabs, buttons, body"
						className="text-base leading-base"
					/>
					<TypeRow
						sample="cart--empty"
						spec="--text-sm · 12/18 · frame names in mono, small UI in sans"
						className="font-mono text-sm leading-sm"
					/>
					<TypeRow
						sample="390 × 844 · 72%"
						spec="--text-xs · 11/16 · readouts, zoom, annotations · always mono"
						className="font-mono text-xs leading-xs"
					/>
				</div>
			</section>

			<section className="flex gap-16">
				<div className="flex w-[608px] flex-col gap-4">
					<SectionTitle>the thread</SectionTitle>
					<ThreadRow faint={false}>will go · solid · 1.5px · read from source</ThreadRow>
					<ThreadRow faint>might go · 40% · 1.5px · a branch decides</ThreadRow>
					<span className="font-mono text-muted text-xs leading-[14px]">
						one arrow per site · tail grows from its element · heads spread at the target edge
					</span>
				</div>
				<div className="flex w-[533px] flex-col gap-4">
					<SectionTitle>selection</SectionTitle>
					<div className="flex gap-8">
						<div className="relative h-24 w-[140px] rounded-lg bg-on-thread">
							<div className="absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
							{[
								"-left-[7px] -top-[7px]",
								"-right-[7px] -top-[7px]",
								"-bottom-[7px] -left-[7px]",
								"-bottom-[7px] -right-[7px]",
							].map((position) => (
								<span
									key={position}
									className={cn(
										"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
										position,
									)}
								/>
							))}
							<span className="absolute left-[38px] top-[110px] rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
								390 × 844
							</span>
						</div>
						<div className="flex flex-col gap-1.5 pt-2 font-mono text-muted text-xs leading-xs">
							<span>ring · 1.5px thread · 3px offset · radius +2</span>
							<span>handles · 8px · on-thread fill, thread border</span>
							<span>readout · thread fill · on-thread mono 10 · radius-xs</span>
						</div>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<SectionTitle>controls</SectionTitle>
				<div className="flex items-center gap-14">
					<div className="flex items-center gap-0.5 rounded-md bg-surface p-0.5">
						<span className="rounded-sm border border-border-raised bg-raised px-3 py-unit font-medium text-sm leading-xs">
							Live
						</span>
						<span className="px-3 py-unit font-medium text-muted text-sm leading-xs">Design</span>
					</div>
					<div className="flex h-10 items-center">
						<span className="rounded-md border border-border-raised bg-raised px-3.5 py-1.5 text-base leading-xs">
							kaffe
						</span>
						<span className="px-3.5 py-1.5 text-base text-muted leading-xs">tretolv</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-sm leading-xs">
						<span className="text-muted">▸&nbsp; menu</span>
						<span className="text-thread">cart</span>
					</div>
					<span className="font-mono text-muted text-xs leading-[14px]">
						label muted · selected label thread · ▸ = paused
					</span>
				</div>
				<div className="flex items-start gap-14">
					<div className="flex w-[456px] flex-col gap-2.5">
						<div className="flex items-center gap-4 text-muted">
							<PlayIcon className="h-4 w-4 text-text" />
							<PlusIcon className="h-4 w-4" />
							<ThreadIcon className="h-4 w-4 text-text" />
							<BackIcon className="h-4 w-4" />
							<RestartIcon className="h-4 w-4" />
							<MotionIcon className="h-4 w-4" />
							<HintIcon className="h-4 w-4" />
							<CloseIcon className="h-4 w-4" />
						</div>
						<span className="font-mono text-muted text-xs leading-[14px]">
							icons · 16px · 1.5 stroke · play, add, threads, back, restart, motion, hint, close
						</span>
					</div>
					<div className="flex flex-col gap-1.5 font-mono text-muted text-xs leading-xs">
						<span>element select (design) · 1px thread outline · 2px offset · no handles</span>
						<span>context chip · raised · mono 2xs · path:line · Open in editor</span>
						<span>boot cover · bg veil 55% · mono booting · hover on raised = surface</span>
						<span>threads toggle · toolbar + T · per project · default on</span>
						<span>player hint · 1.5px thread outline · element radius · overlay only · default off</span>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<SectionTitle>laws</SectionTitle>
				<div className="flex flex-col gap-2.5">
					{laws.map((law, index) => (
						<div key={law} className="flex items-start gap-3 text-base leading-base">
							<span className="shrink-0 font-mono text-sm text-thread">
								{String(index + 1).padStart(2, "0")}
							</span>
							<span>{law}</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="font-semibold text-base leading-xs">{children}</h2>;
}

function TypeRow({ className, sample, spec }: { className: string; sample: string; spec: string }) {
	return (
		<div className="flex items-center">
			<span className={cn("w-[560px]", className)}>{sample}</span>
			<span className="font-mono text-muted text-xs leading-[14px]">{spec}</span>
		</div>
	);
}

function ThreadRow({ children, faint }: { children: React.ReactNode; faint: boolean }) {
	return (
		<div className="flex items-center gap-6">
			<svg
				className="h-6 w-80 shrink-0"
				viewBox="0 0 320 24"
				fill="none"
				aria-hidden="true"
				opacity={faint ? 0.4 : undefined}
			>
				<path d="M2 13C92 10 212 11 304 12" stroke="var(--color-thread)" strokeWidth="1.5" />
				<path d="m312 12-10-5v10Z" fill="var(--color-thread)" />
			</svg>
			<span className="font-mono text-muted text-xs leading-[14px]">{children}</span>
		</div>
	);
}
