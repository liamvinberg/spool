import { type ReactNode, useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { BootCurtain } from "shared/ui/spool/boot-screen";
import { AgentIcon, PropertiesIcon } from "shared/ui/spool/icons";
import { MONO, NAME, Section, Sheet } from "shared/ui/spool/system-sheet";
import { Toast } from "shared/ui/spool/toast";
import { UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * Every animation the app owns, running.
 *
 * The declaration under each name is read off the document, so the durations
 * and curves here are `shared/tokens.css`'s own rather than a copy of them.
 * Press a specimen to play it again: the node is remounted, which is exactly
 * what puts these on screen in the app.
 *
 * The right column is what `prefers-reduced-motion: reduce` gets. It is not
 * always nothing: three of these carry the thing away, so stillness has to be
 * given a picture rather than an absence.
 */

const HOUSE = "cubic-bezier(0.23,1,0.32,1)";

interface Take {
	token: string;
	what: string;
	/** the specimen, remounted on every press */
	live: ReactNode;
	/** what reduced motion is left holding */
	still: ReactNode;
	reduced: string;
}

export default function Motion() {
	const declared = useDeclarations();
	return (
		<Sheet
			title="Motion"
			says="Twenty two named animations and one curve. Nothing here is decoration: each one is a thing arriving, a thing leaving, or a thing saying it is still running."
		>
			<Section
				name="The house curve"
				says={`Everything that travels rather than fades runs on ${HOUSE}. Three hundred milliseconds for a column's edge, one hundred and twenty for the surfaces crossing inside it, one hundred and forty for a press.`}
			>
				<Curves />
			</Section>

			<Section
				name="Arriving and leaving"
				says="Menus, toasts, the finder and the marks. Press any specimen to play it again."
			>
				<Takes declared={declared} takes={ARRIVALS} />
			</Section>

			<Section name="The boot curtain" says="What stands on the field while the daemon is answering.">
				<Takes declared={declared} takes={BOOT} />
			</Section>

			<Section
				name="The agent"
				says="A log that is being written to, and a rail that has to say it is alive without spending any transcript on saying so."
			>
				<Takes declared={declared} takes={AGENT} />
			</Section>

			<Section
				name="The agent's hand"
				says="What the canvas draws while a frame is being written. Nothing here fades in: every one of them is drawn on from where it means something."
			>
				<Takes declared={declared} takes={HAND} />
			</Section>
		</Sheet>
	);
}

/** every `--animate-*` this page draws, read off the document after the first paint */
function useDeclarations(): Readonly<Record<string, string>> {
	const [read, setRead] = useState<Readonly<Record<string, string>>>({});
	useEffect(() => {
		const style = getComputedStyle(document.documentElement);
		const found: Record<string, string> = {};
		for (const take of [...ARRIVALS, ...BOOT, ...AGENT, ...HAND]) {
			found[take.token] = style.getPropertyValue(`--animate-${take.token}`).trim();
		}
		setRead(found);
	}, []);
	return read;
}

function Takes({ declared, takes }: { declared: Readonly<Record<string, string>>; takes: readonly Take[] }) {
	return (
		<div className="flex flex-col border-border border-t">
			<div className="grid grid-cols-[280px_1fr_1fr] gap-8 border-border border-b py-2">
				<span className={MONO}>token</span>
				<span className={MONO}>as it runs</span>
				<span className={MONO}>with reduced motion</span>
			</div>
			{takes.map((take) => (
				<TakeRow key={take.token} take={take} declared={declared[take.token] ?? ""} />
			))}
		</div>
	);
}

function TakeRow({ take, declared }: { take: Take; declared: string }) {
	const [play, setPlay] = useState(0);
	return (
		<div className="grid grid-cols-[280px_1fr_1fr] items-center gap-8 border-border border-b py-5">
			<div className="flex flex-col gap-1.5">
				<span className={NAME}>--animate-{take.token}</span>
				<span className={cn("leading-4", MONO)}>{declared === "" ? "unset" : declared}</span>
				<span className="text-muted/70 text-xs leading-xs">{take.what}</span>
			</div>
			<button
				type="button"
				aria-label={`Play ${take.token}`}
				onClick={() => setPlay((n) => n + 1)}
				className="group relative flex h-[92px] items-center overflow-hidden rounded-md border border-border bg-canvas px-5 text-left"
			>
				<span key={play} className="contents">
					{take.live}
				</span>
				<span
					className={cn(
						"absolute right-3 bottom-2 opacity-0 transition-opacity group-hover:opacity-100",
						MONO,
					)}
				>
					press to replay
				</span>
			</button>
			<div className="flex h-[92px] items-center gap-5 rounded-md border border-border border-dashed px-5">
				<span className="flex min-w-[140px] items-center">{take.still}</span>
				<span className={cn("min-w-0", MONO)}>{take.reduced}</span>
			</div>
		</div>
	);
}

/* ---------- specimens ---------- */

function Pill({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-md border border-border-raised bg-raised px-3.5 py-2.5 text-base text-text leading-base">
			{children}
		</span>
	);
}

function MenuBox({ className }: { className?: string }) {
	return (
		<span
			className={cn("flex w-[176px] flex-col rounded-md border border-border-raised bg-raised p-unit", className)}
		>
			<span className="flex h-[30px] items-center rounded-sm px-3 text-base text-text leading-[14px]">
				Play from here
			</span>
			<span className="mx-auto h-px w-[152px] bg-border-raised" />
			<span className="flex h-[30px] items-center rounded-sm px-3 text-base text-text leading-[14px]">
				Move to Trash
			</span>
		</span>
	);
}

function FindPanel({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"flex h-11 w-[280px] items-center gap-3 rounded-lg border border-border-raised bg-surface px-4",
				className,
			)}
		>
			<span className="font-mono text-md text-muted/60 leading-md">/</span>
			<span className="font-mono text-sm text-muted/50 leading-4">find a frame</span>
		</span>
	);
}

function Scrim({ className }: { className?: string }) {
	return (
		<span className={cn("h-[52px] w-[280px] rounded-md bg-bg/48 backdrop-blur-[2px]", className)}>
			<span className="flex h-full items-center px-4">
				<span className={MONO}>the field, behind the panel</span>
			</span>
		</span>
	);
}

/**
 * The shipped curtain, in a box the size of a row. It centres itself against a
 * canvas and holds 80px off the bottom for the tool bar, so the specimen takes
 * that padding back rather than drawing a second mark.
 */
function Curtain() {
	return (
		<span className="relative block h-[76px] w-[64px] [&>div]:pb-0">
			<BootCurtain ready={false} />
		</span>
	);
}

function Log({ className }: { className?: string }) {
	return (
		<span className={cn("flex w-[300px] flex-col gap-1.5", className)}>
			<span className="font-mono text-sm text-text leading-4">read frames/app/cart/frame.tsx</span>
			<span className="font-mono text-2xs text-muted leading-3">126 lines</span>
		</span>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={cn("h-4 w-4 text-text/60", className)} fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
			<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
		</svg>
	);
}

function Composer({ className, style }: { className?: string; style?: React.CSSProperties }) {
	return (
		<span className="relative block h-[52px] w-[300px] overflow-hidden rounded-md border border-border-raised bg-surface">
			<span className="absolute top-0 left-0 h-px w-full bg-border-raised" />
			<span className={cn("absolute top-0 left-0 h-px w-full origin-left bg-thread", className)} style={style} />
			<span className="flex h-full items-center px-3 font-mono text-sm text-muted/50 leading-4">
				write a frame
			</span>
		</span>
	);
}

function Thread({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 120 60" className={cn("h-[60px] w-[120px] text-thread", className)} fill="none" aria-hidden="true">
			<path
				d="M4 56C4 30 40 30 60 30S116 30 116 6"
				stroke="currentColor"
				strokeWidth="1.5"
				pathLength={1}
				strokeDasharray={1}
			/>
		</svg>
	);
}

const ARRIVALS: readonly Take[] = [
	{
		token: "menu-in",
		what: "the frame menu under the pointer",
		live: <MenuBox className="animate-menu-in" />,
		still: <MenuBox />,
		reduced: "nothing at all: the menu is simply there",
	},
	{
		token: "toast-in",
		what: "a toast rising into the bottom of the canvas",
		live: (
			<span className="animate-toast-in">
				<Pill>Moved cart to Trash</Pill>
			</span>
		),
		still: <Pill>Moved cart to Trash</Pill>,
		reduced: "nothing at all",
	},
	{
		token: "toast-drain",
		what: "the undo window emptying under Home's remove toast",
		live: (
			<span className="relative flex h-[38px] items-center overflow-hidden rounded-md border border-border-raised bg-raised px-3.5">
				<span className="text-base text-text leading-base">Removed kaffe</span>
				<span
					className="absolute bottom-0 left-0 h-px w-full origin-left animate-toast-drain bg-thread"
					style={{ animationDuration: "5000ms" }}
				/>
			</span>
		),
		still: (
			<span className="relative flex h-[38px] items-center overflow-hidden rounded-md border border-border-raised bg-raised px-3.5">
				<span className="text-base text-text leading-base">Removed kaffe</span>
				<span
					className="absolute bottom-0 left-0 h-px w-full origin-left animate-toast-drain bg-thread"
					style={{ animationDuration: "5000ms" }}
				/>
			</span>
		),
		reduced: "it still runs: the bar is the undo window, and a still bar would lie about it",
	},
	{
		token: "toast-sweep",
		what: "the hairline that says an update is still installing",
		live: (
			<span className="relative flex h-[38px] w-[240px] items-center overflow-hidden rounded-md border border-border-raised bg-raised px-3.5">
				<span className="text-base text-muted leading-base">Installing update…</span>
				<span className="absolute bottom-0 left-0 h-px w-1/3 animate-toast-sweep bg-thread" />
			</span>
		),
		still: (
			<span className="relative flex h-[38px] w-[240px] items-center overflow-hidden rounded-md border border-border-raised bg-raised px-3.5">
				<span className="text-base text-muted leading-base">Installing update…</span>
				<span className="absolute bottom-0 left-0 h-px w-1/3 translate-x-full bg-thread" />
			</span>
		),
		reduced: "held mid-sweep, which is the same picture everybody else sees",
	},
	{
		token: "unseen-in",
		what: "a mark for a frame nobody has looked at",
		live: (
			<span className="flex items-center gap-1.5">
				<UnseenMark mark="new" />
				<span className="font-mono text-sm text-text leading-4">receipt</span>
			</span>
		),
		still: (
			<span className="flex items-center gap-1.5">
				<UnseenMark mark="new" />
				<span className="font-mono text-sm text-text leading-4">receipt</span>
			</span>
		),
		reduced: "it still runs: 200ms and a scale, small enough to leave alone",
	},
	{
		token: "find-in",
		what: "the scrim behind the finder",
		live: <Scrim className="block animate-find-in" />,
		still: <Scrim className="block" />,
		reduced: "nothing at all",
	},
	{
		token: "find-panel-in",
		what: "the finder settling out of the space just above it",
		live: <FindPanel className="animate-find-panel-in" />,
		still: <FindPanel />,
		reduced: "nothing at all",
	},
	{
		token: "spring-load",
		what: "the dwell a page asks for before it opens under a drag",
		live: (
			<svg viewBox="0 0 20 20" className="h-5 w-5 text-thread" fill="none" aria-hidden="true">
				<circle
					cx="10"
					cy="10"
					r="8"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeDasharray="50.3"
					className="animate-spring-load origin-center -rotate-90"
					style={{ ["--spring-ms" as string]: "450ms" }}
				/>
			</svg>
		),
		still: (
			<svg viewBox="0 0 20 20" className="h-5 w-5 text-thread" fill="none" aria-hidden="true">
				<circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
			</svg>
		),
		reduced: "it still runs: the arc is the dwell, and a full ring would open the page early",
	},
];

const BOOT: readonly Take[] = [
	{
		token: "boot-in",
		what: "the curtain being allowed to draw, once the gate has passed",
		live: <Curtain />,
		still: <Curtain />,
		reduced: "nothing at all: the mark is simply standing there",
	},
	{
		token: "boot-wind",
		what: "the thread laid into the mark from the bottom band up, and drawn back off",
		live: <Curtain />,
		still: <Curtain />,
		reduced: "the whole mark, still: frozen part wound it reads as a logo that failed to finish",
	},
	{
		token: "boot-out",
		what: "the curtain fading across the frames rather than holding them back",
		live: <span className="animate-boot-out block"><Curtain /></span>,
		still: <span className={MONO}>drawn nowhere</span>,
		reduced: "display: none, because the fade is what takes the curtain off the canvas",
	},
];

const AGENT: readonly Take[] = [
	{
		token: "agent-entry",
		what: "one entry settling into the log",
		live: <Log className="animate-agent-entry" />,
		still: <Log />,
		reduced: "nothing at all",
	},
	{
		token: "agent-word",
		what: "a word fading in as it arrives off the stream",
		live: (
			<span className="flex w-[300px] flex-wrap gap-x-1.5 text-base text-text leading-base">
				{"Reading the cart frame and its two imports".split(" ").map((word, index) => (
					<span
						key={word}
						className="animate-agent-word"
						style={{ animationDelay: `${index * 90}ms`, animationFillMode: "backwards" }}
					>
						{word}
					</span>
				))}
			</span>
		),
		still: <span className="w-[300px] text-base text-text leading-base">Reading the cart frame and its two imports</span>,
		reduced: "nothing at all: every word is already there",
	},
	{
		token: "agent-step",
		what: "a delegate's live step opening under the row that launched it",
		live: (
			<span className="grid w-[300px] animate-agent-step grid-rows-[1fr]">
				<span className="overflow-hidden">
					<span className="font-mono text-sm text-muted leading-4">search · 4 files</span>
				</span>
			</span>
		),
		still: (
			<span className="w-[300px] font-mono text-sm text-muted leading-4">search · 4 files</span>
		),
		reduced: "nothing at all",
	},
	{
		token: "agent-leave",
		what: "the words a step is replacing, on their way out",
		live: (
			<span className="relative flex h-4 w-[300px] items-center">
				<span className="absolute inset-0 font-mono text-sm text-muted leading-4">search · 4 files</span>
				<span className="absolute inset-0 animate-agent-leave bg-canvas font-mono text-sm text-muted leading-4">
					reading cart
				</span>
			</span>
		),
		still: <span className={MONO}>drawn nowhere</span>,
		reduced: "display: none, because the fade is what carries them away",
	},
	{
		token: "agent-spin",
		what: "a ring turning slowly enough to read as work rather than an alarm",
		live: <Spinner className="animate-agent-spin" />,
		still: <Spinner />,
		reduced: "nothing at all: the ring holds where it is",
	},
	{
		token: "agent-wind",
		what: "the thread laid out of one edge of the composer and taken up into the other",
		live: <Composer className="animate-agent-wind" />,
		still: <Composer style={{ transform: "translateX(6.372%) scaleX(0.3406)" }} />,
		reduced: "held a third of the way along its own cycle, so stillness is never absence",
	},
	{
		token: "agent-menu-in",
		what: "the model menu, which opens upward off an 18px line",
		live: <MenuBox className="animate-agent-menu-in" />,
		still: <MenuBox />,
		reduced: "nothing at all",
	},
];

const HAND: readonly Take[] = [
	{
		token: "hand-wind",
		what: "the thread winding off the node onto the frame",
		live: <Thread className="animate-hand-wind" />,
		still: <Thread />,
		reduced: "nothing at all: a thread told not to wind on is a thread already on",
	},
	{
		token: "hand-node",
		what: "the node arriving at its own size rather than growing into place",
		live: <span className="block h-3 w-3 animate-hand-node rounded-full bg-thread" />,
		still: <span className="block h-3 w-3 rounded-full bg-thread" />,
		reduced: "nothing at all",
	},
	{
		token: "hand-plate",
		what: "the block that was written, marked out fast, held, and drained",
		live: (
			<span className="block h-10 w-[240px] origin-center animate-hand-plate rounded-xs bg-thread" />
		),
		still: <span className="block h-10 w-[240px] rounded-xs bg-thread/15" />,
		reduced: "struck at once, held, gone: it keeps its life and loses its gesture",
	},
	{
		token: "hand-lane",
		what: "the ledger beside the frame, carrying the age of a run in ink and in width",
		live: <span className="block h-10 w-[3px] animate-hand-lane bg-thread" />,
		still: <span className="block h-10 w-[3px] bg-thread/90" />,
		reduced: "the same three stops, taken in one step each",
	},
];

/** the one curve, at the three durations the app spends it at */
function Curves() {
	const [open, setOpen] = useState(true);
	const [pressed, setPressed] = useState(false);
	return (
		<div className="flex flex-wrap gap-6">
			<div className="flex w-[560px] flex-col gap-3">
				<div className="relative flex h-[132px] overflow-hidden rounded-md border border-border bg-canvas">
					<div className="min-w-0 flex-1 px-5 py-4">
						<span className={MONO}>the field</span>
					</div>
					<div
						className="h-full shrink-0 overflow-hidden border-border border-l bg-bg transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
						style={{ width: open ? 300 : 0 }}
					>
						<div className="flex h-full w-[300px] flex-col gap-2 px-4 py-4">
							<span className={NAME}>properties</span>
							<span className={MONO}>300, laid out and clipped</span>
						</div>
					</div>
					<div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5">
						<button
							type="button"
							aria-label="Shut properties"
							onClick={() => setOpen((held) => !held)}
							className={cn(
								"flex h-8 w-8 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
								open ? "bg-raised text-text" : "text-muted/70 hover:text-text",
							)}
						>
							<PropertiesIcon className="h-4 w-4" />
						</button>
						<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
							<AgentIcon className="h-4 w-4" />
						</span>
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<span className={NAME}>300ms · the column's edge</span>
					<span className={MONO}>
						press the lit glyph. The edge travels and the surface inside it is laid out at the width it
						will settle at, so no rail ever re-lays on the way in.
					</span>
				</div>
			</div>

			<div className="flex w-[340px] flex-col gap-3">
				<div className="relative h-[132px] overflow-hidden rounded-md border border-border bg-canvas">
					<div
						className={cn(
							"absolute inset-0 flex items-center justify-center transition-opacity duration-[120ms] ease-out motion-reduce:transition-none",
							open ? "opacity-100" : "opacity-0",
						)}
					>
						<span className={NAME}>properties</span>
					</div>
					<div
						className={cn(
							"absolute inset-0 flex items-center justify-center transition-opacity duration-[120ms] ease-out motion-reduce:transition-none",
							open ? "opacity-0" : "opacity-100",
						)}
					>
						<span className={NAME}>agent</span>
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<span className={NAME}>120ms · the surfaces crossing</span>
					<span className={MONO}>
						done before the edge is, so what reads is the edge travelling rather than a card being dealt.
					</span>
				</div>
			</div>

			<div className="flex w-[340px] flex-col gap-3">
				<div className="flex h-[132px] items-center justify-center rounded-md border border-border bg-canvas">
					<button
						type="button"
						aria-label="Press"
						onPointerDown={() => setPressed(true)}
						onPointerUp={() => setPressed(false)}
						onPointerLeave={() => setPressed(false)}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-sm bg-raised text-text transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
							pressed && "scale-90",
						)}
					>
						<PropertiesIcon className="h-4 w-4" />
					</button>
				</div>
				<div className="flex flex-col gap-1">
					<span className={NAME}>140ms · the press</span>
					<span className={MONO}>active:scale-90. The glyph gives under the finger, and colour arrives over the same span.</span>
				</div>
			</div>
		</div>
	);
}
