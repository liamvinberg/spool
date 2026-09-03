import { type ReactNode, useState } from "react";
import { type Life, LIVE, nameOf, type Thread, THREADS } from "shared/lib/explore/threads/threads-fixture";
import { cn } from "shared/lib/utils";
import { AgentIcon, ChevronIcon, CloseIcon, PanelCaret, PlusIcon, PropertiesIcon, ThreadIcon } from "shared/ui/spool/icons";
import { StateMark } from "shared/ui/spool/play-rail";
import { Said } from "shared/ui/spool/say";

/**
 * The dock as it ships, with one knob: where the other conversations live and what they
 * are called (#136, #205).
 *
 * The rail today is three columns of chrome beside the log. The panel has a nameplate
 * over it saying which thread this is. Down the panel's outer edge stands a 34px column
 * of marks, one per thread, with a plus on top; hovering a mark opens a flyout with the
 * thread's name, its last line, its age and a close. Beside that stands the dock strip,
 * 44px, whose two glyphs switch the panel between properties and the agent. The plate,
 * the column and the strip are three answers to three questions, and read together they
 * are a lot of edge for a 420px rail.
 *
 * The name is the other half. A thread is called the frames it wrote: `home, receipt`.
 * That is short and unique and says where the work landed. It does not say what was
 * asked, and two threads on the same frame get the same name.
 *
 *   spine   today
 *   ask     today's chrome, and the thread is called what the person first said. The
 *           flyout wraps it to three lines; the frames it wrote become the second line.
 *   plate   the column is gone. The nameplate carries the ask, the marks of whatever is
 *           moving elsewhere, the plus and a chevron that drops the list over the log.
 *   shelf   the column is gone and the list is a surface: the plate opens it in the
 *           transcript's place, grouped by what is happening, and the composer stays so
 *           typing starts a new thread.
 *   dock    the column is gone and threads are the dock's third glyph, so every switch
 *           the rail makes is made in one strip. The panel's plate is only the ask.
 */
export type Take = "spine" | "ask" | "plate" | "shelf" | "dock";

/** the dock strip's width, and the column's, both the shipped numbers */
const STRIP_W = 44;
const SPINE_W = 34;

export function ThreadsStage({
	take,
	aligned = false,
}: {
	take: Take;
	/** the column keeps the dock strip's rhythm: a 32px cell every 36px, the plus level with the properties glyph */
	aligned?: boolean;
}) {
	const [open, setOpen] = useState(LIVE.id);
	// the list-taking takes start open, because the list is the thing being asked about
	const [listing, setListing] = useState(take === "plate" || take === "shelf" || take === "dock");
	const current = THREADS.find((thread) => thread.id === open) ?? LIVE;
	const pick = (id: string) => {
		setOpen(id);
		setListing(false);
	};
	const others = THREADS.filter((thread) => thread.id !== open);
	const surface: "agent" | "threads" = take === "dock" && listing ? "threads" : "agent";

	return (
		<div className="flex h-full w-full bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-w-0 flex-1" />
			<div className="relative flex h-full w-[420px] shrink-0 border-border border-l bg-bg">
				{surface === "threads" ? (
					<div className="flex min-w-0 flex-1 flex-col">
						<Plate>
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-4">threads</span>
							<PlateButton label="New thread">
								<PlusIcon className="h-2.5 w-2.5" />
							</PlateButton>
							<PlateButton label="Shut threads" onClick={() => setListing(false)}>
								<PanelCaret dir="right" className="h-3 w-3" />
							</PlateButton>
						</Plate>
						<Shelf threads={THREADS} open={open} onPick={pick} />
					</div>
				) : (
					<div className="flex min-w-0 flex-1 flex-col">
						{take === "spine" ? (
							<Plate>
								<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-4">{nameOf(current)}</span>
								<PlateButton label="Shut agent">
									<PanelCaret dir="right" className="h-3 w-3" />
								</PlateButton>
							</Plate>
						) : take === "ask" ? (
							<Plate>
								<span className="min-w-0 flex-1 truncate text-sm text-text leading-4">{current.ask}</span>
								<PlateButton label="Shut agent">
									<PanelCaret dir="right" className="h-3 w-3" />
								</PlateButton>
							</Plate>
						) : take === "dock" ? (
							<Plate>
								<span className="min-w-0 flex-1 truncate text-sm text-text leading-4">{current.ask}</span>
								<PlateButton label="New thread">
									<PlusIcon className="h-2.5 w-2.5" />
								</PlateButton>
								<PlateButton label="Shut agent">
									<PanelCaret dir="right" className="h-3 w-3" />
								</PlateButton>
							</Plate>
						) : take === "plate" ? (
							<ThreadPlate threads={THREADS} open={open} listing={listing} onToggle={() => setListing(!listing)} />
						) : (
							<Plate>
								<button
									type="button"
									onClick={() => setListing(!listing)}
									aria-expanded={listing}
									className="-ml-1.5 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-surface"
								>
									<span className="min-w-0 flex-1 truncate text-sm text-text leading-4">{current.ask}</span>
									<ChevronIcon open={listing} className="h-2.5 w-2.5 shrink-0 text-muted/45" />
								</button>
								<PlateButton label="New thread">
									<PlusIcon className="h-2.5 w-2.5" />
								</PlateButton>
								<PlateButton label="Shut agent">
									<PanelCaret dir="right" className="h-3 w-3" />
								</PlateButton>
							</Plate>
						)}
						<div className="relative flex min-h-0 flex-1 flex-col">
							{take === "shelf" && listing ? (
								<Shelf threads={THREADS} open={open} onPick={pick} />
							) : (
								<Log thread={current} />
							)}
							{take === "plate" && listing ? <ThreadDrop threads={THREADS} open={open} onPick={pick} /> : null}
						</div>
						<Composer fresh={take === "shelf" && listing} />
					</div>
				)}
				{take === "spine" || take === "ask" ? <Spine threads={THREADS} open={open} onPick={pick} askNamed={take === "ask"} aligned={aligned} /> : null}
			</div>
			<DockStrip
				surface={surface}
				threads={take === "dock"}
				elsewhere={others}
				onThreads={take === "dock" ? () => setListing(!listing) : undefined}
			/>
		</div>
	);
}

/* ---------- the plate over the log ---------- */

/**
 * The decided plate (2026-09-03): the ask, the marks of whatever is moving in another
 * thread, a chevron that drops the list, and the plus. No collapse caret, because the dock
 * glyph that opened the panel is the thing that shuts it. Exported so the compile on
 * `explore/agent` can wear it over a live turn.
 */
export function ThreadPlate({
	threads,
	open,
	listing,
	onToggle,
}: {
	threads: readonly Thread[];
	open: string;
	listing: boolean;
	onToggle: () => void;
}) {
	const current = threads.find((thread) => thread.id === open) ?? LIVE;
	const others = threads.filter((thread) => thread.id !== open);
	return (
		<Plate>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={listing}
				className="-ml-1.5 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="min-w-0 flex-1 truncate text-sm text-text leading-4">{current.ask}</span>
				{/* what is moving elsewhere, so the column's one glanceable answer survives it */}
				<Elsewhere threads={others} />
				<ChevronIcon open={listing} className="h-2.5 w-2.5 shrink-0 text-muted/45" />
			</button>
			<PlateButton label="New thread">
				<PlusIcon className="h-2.5 w-2.5" />
			</PlateButton>
		</Plate>
	);
}

function Plate({ children }: { children: ReactNode }) {
	return <div className="flex h-[34px] shrink-0 items-center gap-1 border-border border-b px-3.5">{children}</div>;
}

function PlateButton({ label, onClick, children }: { label: string; onClick?: (() => void) | undefined; children: ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-150 last:-mr-1.5 hover:text-text"
		>
			{children}
		</button>
	);
}

/** the marks of the threads that are doing something, for a plate that stands in for the column */
function Elsewhere({ threads }: { threads: readonly Thread[] }) {
	const moving = threads.filter((thread) => thread.life !== "read");
	if (moving.length === 0) return null;
	return (
		<span className="flex shrink-0 items-center gap-1">
			{moving.map((thread) => (
				<Mark key={thread.id} life={thread.life} />
			))}
		</span>
	);
}

/* ---------- the marks ----------
 * The shipped vocabulary: motion for work, a disc for stopped, a dot for unread, a hollow
 * dot for read. Nothing is the accent, because the accent says which one is open. */
function Mark({ life, className }: { life: Life; className?: string | undefined }) {
	const turning = life === "streaming" || life === "running";
	return (
		<span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			{turning ? (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 animate-agent-spin text-text/60" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			) : life === "waiting" ? (
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
					<circle cx="7" cy="7" r="2.2" fill="currentColor" />
				</svg>
			) : life === "unread" ? (
				<span className="h-[5px] w-[5px] rounded-full bg-text/85" />
			) : (
				<span className="h-[5px] w-[5px] rounded-full border border-muted/60" />
			)}
		</span>
	);
}

/* ---------- today's column, and its flyout ---------- */

function Spine({
	threads,
	open,
	onPick,
	askNamed,
	aligned,
}: {
	threads: readonly Thread[];
	open: string;
	onPick: (id: string) => void;
	/** the flyout names the thread by its ask rather than by what it wrote */
	askNamed: boolean;
	aligned: boolean;
}) {
	const [over, setOver] = useState<string | null>(null);
	const cell = aligned ? "h-8" : "h-[34px]";
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the handler only takes the hover away; every control in the column is a button
		<div
			className={cn("relative flex shrink-0 flex-col border-border border-l", aligned && "gap-1 pt-1.5")}
			style={{ width: SPINE_W }}
			onMouseLeave={() => setOver(null)}
		>
			<button
				type="button"
				aria-label="New thread"
				className={cn(
					"flex shrink-0 items-center justify-center text-muted/45 transition-colors duration-150 hover:text-text",
					cell,
					aligned ? "mx-auto w-8 rounded-sm hover:bg-surface/40" : "border-border border-b",
				)}
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			{threads.map((thread, index) => {
				const on = thread.id === open;
				return (
					<div key={thread.id} className="relative">
						<button
							type="button"
							aria-label={askNamed ? thread.ask : nameOf(thread)}
							aria-current={on ? "true" : undefined}
							onMouseEnter={() => setOver(thread.id)}
							onFocus={() => setOver(thread.id)}
							onClick={() => onPick(thread.id)}
							className={cn(
								"relative flex w-full items-center justify-center transition-colors duration-150",
								cell,
								aligned && "mx-auto w-8 rounded-sm",
								on ? "bg-surface/70" : "hover:bg-surface/40",
							)}
						>
							{on ? <span className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-thread" /> : null}
							{/* the thread you are watching draws nothing here: the log beside it is already its mark */}
							{thread.life === "streaming" ? null : <Mark life={thread.life} />}
						</button>
						{over === thread.id ? (
							<div
								className="absolute z-20 w-[268px] border border-border-raised bg-surface px-3 py-2.5"
								style={{ right: SPINE_W, top: index === threads.length - 1 ? undefined : 0, bottom: index === threads.length - 1 ? 0 : undefined }}
							>
								{askNamed ? (
									<>
										<p className="line-clamp-3 text-sm text-text leading-4">{thread.ask}</p>
										<div className="mt-1.5 flex items-center gap-2">
											<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/60 leading-3">
												{thread.wrote === "" ? "nothing written yet" : thread.wrote}
											</span>
											<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
											<Close />
										</div>
									</>
								) : (
									<>
										<p className="font-mono text-sm text-text leading-4">{nameOf(thread)}</p>
										<div className="mt-1.5 flex items-center gap-2">
											<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/60 leading-3">{thread.last}</span>
											<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
											<Close />
										</div>
									</>
								)}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function Close() {
	return (
		<button
			type="button"
			aria-label="close thread"
			className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/45 transition-colors duration-150 hover:text-text"
		>
			<CloseIcon className="h-2.5 w-2.5" />
		</button>
	);
}

/* ---------- the list, twice ----------
 * `Drop` hangs off the plate over the log. `Shelf` takes the log's place. Both draw the
 * same row: the mark, the ask wrapping to three lines, and under it what the thread wrote
 * and how long ago, in the machine register. */

/**
 * The ask fades out under the close on hover, and the fade itself is eased. A mask image
 * cannot transition, so the cut is always in the mask and parked 56px past the right edge
 * where it masks nothing; hover slides it in over 180ms on the house curve, and the close
 * fades in over the same span. Exclude is XOR: the full layer minus the gradient's box, so
 * the top-right 56 by 16 px of the first line goes from ink to nothing under the close.
 * Plain CSS rather than a utility, because the value carries a slash and a comma list, which
 * the class parser reads as a modifier and drops.
 */
const ASK_FADE = `
.thread-ask {
	-webkit-mask: linear-gradient(#000, #000), linear-gradient(to right, transparent, #000) calc(100% + 56px) 0 / 56px 16px no-repeat;
	-webkit-mask-composite: xor;
	mask: linear-gradient(#000, #000), linear-gradient(to right, transparent, #000) calc(100% + 56px) 0 / 56px 16px no-repeat;
	mask-composite: exclude;
	transition: -webkit-mask-position 180ms cubic-bezier(0.22, 0.61, 0.36, 1), mask-position 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.thread-row:hover .thread-ask {
	-webkit-mask-position: 0 0, 100% 0;
	mask-position: 0 0, 100% 0;
}
@media (prefers-reduced-motion: reduce) { .thread-ask { transition: none; } }
`;

function ThreadRow({ thread, on, onPick }: { thread: Thread; on: boolean; onPick: (id: string) => void }) {
	return (
		<div className="group thread-row relative flex">
			<button
				type="button"
				onClick={() => onPick(thread.id)}
				aria-current={on ? "true" : undefined}
				className={cn(
					"flex min-w-0 flex-1 items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors duration-150",
					on ? "bg-surface/70" : "hover:bg-surface/40",
				)}
			>
				<Mark life={thread.life} className="mt-[1px]" />
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span
						className={cn(
							"line-clamp-3 text-sm leading-4",
							on ? "text-text" : "text-text/85",
							// the close lands on the first line's end, so on hover that corner of the ask
							// fades out under it rather than the two overprinting: a mask cut out of the
							// top-right 56 by 16 px, gradient so the fade is a fade
							"thread-ask",
						)}
					>
						{thread.ask}
					</span>
					<span className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/55 leading-3">
							{thread.wrote === "" ? thread.last : thread.wrote}
						</span>
						<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
					</span>
				</span>
			</button>
			{/* the close is a deliberate act: on hover, and off the ask so a miss opens rather than closes */}
			<span className="absolute top-2 right-2 opacity-0 transition-opacity duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:opacity-100">
				<Close />
			</span>
		</div>
	);
}

export function ThreadDrop({ threads, open, onPick }: { threads: readonly Thread[]; open: string; onPick: (id: string) => void }) {
	return (
		<div className="absolute inset-x-0 top-0 z-20 animate-agent-menu-in border-border border-b bg-bg p-1.5 shadow-none">
			<style>{ASK_FADE}</style>
			{threads.map((thread) => (
				<ThreadRow key={thread.id} thread={thread} on={thread.id === open} onPick={onPick} />
			))}
		</div>
	);
}

/** the same rows grouped by what is happening to them, because a surface has the room to say it */
function Shelf({ threads, open, onPick }: { threads: readonly Thread[]; open: string; onPick: (id: string) => void }) {
	const groups: readonly { label: string; lives: readonly Life[] }[] = [
		{ label: "working", lives: ["streaming", "running"] },
		{ label: "waiting on you", lives: ["waiting"] },
		{ label: "finished", lives: ["unread", "read"] },
	];
	return (
		<div className="pages-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pt-3 pb-4">
			<style>{ASK_FADE}</style>
			{groups.map((group) => {
				const rows = threads.filter((thread) => group.lives.includes(thread.life));
				if (rows.length === 0) return null;
				return (
					<div key={group.label} className="flex flex-col gap-0.5">
						<span className="px-2 pb-1 font-mono text-2xs text-muted/45 leading-3">{group.label}</span>
						{rows.map((thread) => (
							<ThreadRow key={thread.id} thread={thread} on={thread.id === open} onPick={onPick} />
						))}
					</div>
				);
			})}
		</div>
	);
}

/* ---------- the log, settled, so the chrome around it is what changes ---------- */

function Log({ thread }: { thread: Thread }) {
	const rows: readonly { verb: string; subject: string; quiet?: boolean; running?: boolean }[] = [
		{ verb: "thinking", subject: "0.2s", quiet: true },
		{ verb: "write", subject: "home" },
		{ verb: "shot", subject: "home" },
		{ verb: "look", subject: "home" },
		{ verb: "thinking", subject: "5.5s", quiet: true },
	];
	return (
		<div className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4">
			<div className="mt-auto flex flex-col">
				<div className="relative flex flex-col gap-1.5 pl-3.5">
					<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
					<p className="whitespace-pre-wrap text-base text-text leading-base">{thread.ask}</p>
					<span className="truncate font-mono text-2xs text-muted/55 leading-3">cart</span>
				</div>
				{rows.map((row, index) => (
					<div
						key={`${row.verb}-${index}`}
						className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5"
						style={{ marginTop: index === 0 ? 14 : 6 }}
					>
						<StateMark state="done" />
						<span className="flex min-w-0 items-baseline gap-1.5">
							<span className={cn("shrink-0 font-mono text-sm leading-4", row.quiet ? "text-muted/70" : "text-muted")}>{row.verb}</span>
							<span className={cn("font-mono text-sm leading-4", row.quiet ? "text-muted/60 tabular-nums" : "text-text/85")}>
								{row.subject}
							</span>
						</span>
						{row.quiet ? null : <ChevronIcon className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />}
					</div>
				))}
				<div className="pt-3.5">
					<Said text="Home renders correctly and all numbers reconcile. One real problem: about 130px of dead space above the CTA. Absorbing it into row height keeps the rhythm." />
				</div>
				<div className="-mx-1.5 mt-3.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
					<StateMark state="running" />
					<span className="flex min-w-0 items-baseline gap-1.5">
						<span className="shrink-0 font-mono text-sm text-muted leading-4">edit</span>
						<span className="font-mono text-sm text-text/85 leading-4">home</span>
						<span className="font-mono text-sm text-text/85 tabular-nums leading-4">×6</span>
					</span>
					<ChevronIcon className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />
				</div>
			</div>
		</div>
	);
}

function Composer({ fresh }: { fresh: boolean }) {
	return (
		<div className="flex shrink-0 flex-col gap-2.5 px-3.5 pb-3.5">
			<div className="flex min-h-[80px] flex-col gap-3 rounded-md border border-border-raised bg-surface p-3">
				<span className="text-base text-muted/60 leading-base">{fresh ? "start a new thread" : "say what to change"}</span>
			</div>
			<span className="flex items-center gap-1 font-mono text-2xs text-muted/45 leading-3">
				Default (recommended) · high
				<ChevronIcon className="h-2 w-2" />
			</span>
		</div>
	);
}

/* ---------- the dock strip ---------- */

export function DockStrip({
	surface,
	threads,
	elsewhere,
	onThreads,
}: {
	surface: "agent" | "threads";
	/** the strip carries a third glyph for the threads */
	threads: boolean;
	elsewhere: readonly Thread[];
	onThreads?: (() => void) | undefined;
}) {
	// the strip's one badge: the loudest thing happening in a thread you are not looking at
	const busy = elsewhere.find((thread) => thread.life === "running" || thread.life === "streaming");
	const unread = elsewhere.find((thread) => thread.life === "unread" || thread.life === "waiting");
	const badge: Life | null = busy?.life ?? unread?.life ?? null;
	return (
		<div className="flex h-full shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5" style={{ width: STRIP_W }}>
			<Glyph label="properties" lit={false}>
				<PropertiesIcon className="h-4 w-4" />
			</Glyph>
			<Glyph label="agent" lit={surface === "agent"} badge={threads ? null : badge}>
				<AgentIcon className="h-4 w-4" />
			</Glyph>
			{threads ? (
				<Glyph label="threads" lit={surface === "threads"} badge={badge} onClick={onThreads}>
					<ThreadIcon className="h-4 w-4" />
				</Glyph>
			) : null}
		</div>
	);
}

function Glyph({
	label,
	lit,
	badge = null,
	onClick,
	children,
}: {
	label: string;
	lit: boolean;
	badge?: Life | null;
	onClick?: (() => void) | undefined;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={lit}
			onClick={onClick}
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] active:scale-90",
				lit ? "bg-raised text-text" : "text-muted/70 hover:text-text",
			)}
		>
			{children}
			{lit || badge === null ? null : badge === "running" || badge === "streaming" ? (
				<svg viewBox="0 0 14 14" aria-hidden="true" fill="none" className="-right-1 absolute top-0 h-3 w-3 animate-agent-spin text-text/60">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			) : (
				<span aria-hidden="true" className="-right-0.5 absolute top-0.5 h-1.5 w-1.5 rounded-full bg-thread" />
			)}
		</button>
	);
}
