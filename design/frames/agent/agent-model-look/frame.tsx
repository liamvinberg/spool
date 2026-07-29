import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ClaudeModel, EFFORT_SAYS, type Effort, useModels } from "../../../shared/lib/agent-model";
import { cn } from "../../../shared/lib/utils";

/**
 * agent-model-look — the model menu drawn four ways, because all four complaints
 * about it were the same complaint.
 *
 * #118 settled the *model*: one axis, five offered choices, effort as a property
 * of the model, everything populated by `list_models` at runtime so a new or
 * retired model needs no spool release. None of that is reopened here. What was
 * never drawn against the real reply is the *menu*, and looked at in the compile
 * it has four faults that turn out to be one:
 *
 *   the duplicate. `Default (Recommended)` and `Opus (1M context)` carry the
 *   identical sentence, because they resolve to the same model. That is the
 *   binary's own data and not a bug — but printing it twice is spool's choice.
 *
 *   the ragged rows. A description wraps to one line or two depending on how the
 *   sentence fell, so five rows have five heights and the list has no rhythm.
 *
 *   the prose. Five sentences in the list plus a sixth under the effort row is
 *   more words than the 18px trigger that opens it has in a whole turn.
 *
 *   the two vocabularies. Models are rows with sentences under them; effort is a
 *   row of small chips with one sentence under the lot. Two shapes, one menu.
 *
 * **They are one fault: the menu prints every sentence at once when only the one
 * under the cursor is being read.** The effort row already worked that way and
 * was the only part nobody complained about, so three of the four candidates here
 * are that idea taken further and the fourth is the honest do-less version.
 *
 * Each column is the menu at its real 300px, on the real reply, with its own
 * measured height under it.
 *
 * **Height turned out not to be the argument, and measuring is what said so.**
 * Every figure computed by hand first was wrong — 304 against a real 383, 220
 * against 353 — and the four cluster inside 98px (383, 353, 338, 285) rather than
 * spreading the way the word counts do. `one sentence` saves 30px on `shipped`
 * while deleting four fifths of the prose, because its slot reserves the tallest
 * sentence it can ever say and the tallest is long. So none of these is chosen for
 * fitting: they all fit. What separates them is whether the list has a rhythm and
 * whether anything on it is printed twice, and those are read rather than measured.
 */

/* ---------- the shared parts, copied rather than imported ----------
 * `spool-model-control.tsx` ships one look. Giving it a `look` prop would put a
 * variation switch inside a shared component, which is the exact thing #180 spent
 * the compile taking back out. So the candidates live here until one wins. */

const QUIET = "font-mono text-2xs leading-3";

/**
 * The panel, measuring itself.
 *
 * The height is observed rather than computed, because a computed one would be
 * wrong about the column it matters most for: `shipped`'s rows are 40px or 54px
 * depending on whether the sentence wrapped, which is the ragged-rows complaint
 * itself, so any formula quietly assumes the fault away. It is live, so hovering
 * a row shows whether that candidate moves under the pointer.
 */
function Menu({ children }: { children: ReactNode }) {
	const box = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | null>(null);
	useEffect(() => {
		const node = box.current;
		if (node === null) return;
		const watch = new ResizeObserver(() => setHeight(Math.round(node.getBoundingClientRect().height)));
		watch.observe(node);
		return () => watch.disconnect();
	}, []);
	return (
		<div className="flex flex-col gap-2">
			<div ref={box} className="w-[300px] rounded-md border border-border-raised bg-raised p-1.5">
				{children}
			</div>
			<span className={cn(QUIET, "text-muted/35")}>{height === null ? "" : `${height}px tall`}</span>
		</div>
	);
}

function Group({ label }: { label: string }) {
	return <span className={cn(QUIET, "block px-1.5 pt-1 pb-1.5 text-muted/35")}>{label}</span>;
}

function Rule() {
	return <span className="my-1 block h-px bg-border" />;
}

/** the sentence slot: one line of room, held at the tallest thing it can say */
function Says({ text, longest }: { text: string | null; longest: string }) {
	return (
		<p className={cn(QUIET, "relative px-1.5 pt-1.5 pb-0.5 text-muted/40 leading-[1.5]")}>
			<span className="invisible" aria-hidden="true">
				{longest}
			</span>
			<span className="absolute inset-x-1.5 top-1.5">{text}</span>
		</p>
	);
}

function NameRow({
	label,
	on,
	says,
	onOver,
}: {
	label: string;
	on: boolean;
	says?: string | undefined;
	onOver?: (() => void) | undefined;
}) {
	return (
		<button
			type="button"
			onMouseEnter={onOver}
			className={cn(
				"flex w-full min-w-0 flex-col gap-0.5 rounded-xs px-1.5 py-1 text-left transition-colors duration-150",
				on ? "bg-surface text-text" : "text-text/70 hover:bg-surface/60",
			)}
		>
			<span className="min-w-0 truncate font-mono text-xs leading-4">{label}</span>
			{says === undefined ? null : (
				<span className={cn(QUIET, "w-full truncate text-muted/40 leading-[1.5]")}>{says}</span>
			)}
		</button>
	);
}

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const LONGEST_EFFORT = EFFORT_SAYS.max ?? "";

/* ---------- was ----------
 * What the rail drew before #186, kept as the diff the way `--say-raw` is kept for
 * #148. The hover reflow is already taken out of it, because a menu that moves
 * under the pointer was a defect under every candidate and landed on its own. */

function Shipped({ models }: { models: readonly ClaudeModel[] }) {
	const [over, setOver] = useState<Effort | null>(null);
	return (
		<Menu>
			{models.map((model) => (
				<button
					key={model.value}
					type="button"
					className={cn(
						"flex w-full min-w-0 flex-col gap-0.5 rounded-xs px-1.5 py-1 text-left",
						model.value === "opus[1m]" ? "bg-surface text-text" : "text-text/70",
					)}
				>
					<span className="min-w-0 truncate font-mono text-xs leading-4">{model.displayName}</span>
					<span className={cn(QUIET, "line-clamp-2 w-full text-muted/40 leading-[1.5]")}>{model.description}</span>
				</button>
			))}
			<Rule />
			<Group label="effort" />
			<span className="flex flex-wrap items-center gap-0.5 px-1" onMouseLeave={() => setOver(null)}>
				{EFFORTS.map((level) => (
					<button
						key={level}
						type="button"
						onMouseEnter={() => setOver(level)}
						className={cn(QUIET, "h-[20px] rounded-xs px-1.5", level === "xhigh" ? "bg-surface text-text" : "text-muted/50")}
					>
						{level}
					</button>
				))}
			</span>
			<Says text={EFFORT_SAYS[over ?? "xhigh"]} longest={LONGEST_EFFORT} />
		</Menu>
	);
}

/* ---------- one sentence ----------
 * What shipped. The list is names, and the one sentence at the bottom
 * describes whatever the cursor is on — a model or an effort level, the same slot
 * either way. Every complaint dies at once: nothing repeats because only one
 * sentence exists, rows are one line each so the list has a rhythm, the prose is
 * a fifth of what it was, and the two halves stop being two shapes because they
 * now feed the same slot. It is also not a new idea — it is what the effort row
 * already did, which is the half nobody objected to. */

function OneSentence({ models }: { models: readonly ClaudeModel[] }) {
	const [over, setOver] = useState<string | null>(null);
	const longest = [...models.map((model) => model.description), LONGEST_EFFORT].reduce(
		(tallest, says) => (says.length > tallest.length ? says : tallest),
		"",
	);
	const said =
		over === null
			? (models.find((model) => model.value === "opus[1m]")?.description ?? null)
			: (EFFORT_SAYS[over as Effort] ?? models.find((model) => model.value === over)?.description ?? null);
	return (
		<Menu>
			<span onMouseLeave={() => setOver(null)}>
				{models.map((model) => (
					<NameRow
						key={model.value}
						label={model.displayName}
						on={model.value === "opus[1m]"}
						onOver={() => setOver(model.value)}
					/>
				))}
				<Rule />
				<Group label="effort" />
				{EFFORTS.map((level) => (
					<NameRow key={level} label={level} on={level === "xhigh"} onOver={() => setOver(level)} />
				))}
			</span>
			<Says text={said} longest={longest} />
		</Menu>
	);
}

/* ---------- one line ----------
 * The do-less version, and the one to beat: keep a description per row and clamp
 * it to one line. Rows even up and the prose halves, but the duplicate survives
 * word for word — two adjacent rows reading `Opus 5 with 1M context · Best for…`
 * is the complaint at full strength — and effort is still a second shape. It is
 * here because it is the smallest change that fixes anything, and because seeing
 * the duplicate survive is the argument against it. */

function OneLine({ models }: { models: readonly ClaudeModel[] }) {
	const [over, setOver] = useState<Effort | null>(null);
	return (
		<Menu>
			{models.map((model) => (
				<NameRow
					key={model.value}
					label={model.displayName}
					says={model.description}
					on={model.value === "opus[1m]"}
				/>
			))}
			<Rule />
			<Group label="effort" />
			<span className="flex flex-wrap items-center gap-0.5 px-1" onMouseLeave={() => setOver(null)}>
				{EFFORTS.map((level) => (
					<button
						key={level}
						type="button"
						onMouseEnter={() => setOver(level)}
						className={cn(QUIET, "h-[20px] rounded-xs px-1.5", level === "xhigh" ? "bg-surface text-text" : "text-muted/50")}
					>
						{level}
					</button>
				))}
			</span>
			<Says text={EFFORT_SAYS[over ?? "xhigh"]} longest={LONGEST_EFFORT} />
		</Menu>
	);
}

/* ---------- bare ----------
 * No sentences at all: names, and effort as rows under them. It is the shortest
 * menu by a long way and it is the one that gives something up — `list_models`
 * sends a description per model and this throws all of it away, which is spool
 * deciding what you do not need to know about a machine it did not name. Drawn
 * because the height is the argument: if the sentence slot is what stops the menu
 * fitting above an 18px line, this is what fitting costs. */

function Bare({ models }: { models: readonly ClaudeModel[] }) {
	return (
		<Menu>
			{models.map((model) => (
				<NameRow key={model.value} label={model.displayName} on={model.value === "opus[1m]"} />
			))}
			<Rule />
			<Group label="effort" />
			{EFFORTS.map((level) => (
				<NameRow key={level} label={level} on={level === "xhigh"} />
			))}
		</Menu>
	);
}

const TAKES = [
	{
		id: "was",
		says: "what the rail drew before #186. five sentences, ragged rows, chips",
		render: Shipped,
	},
	{
		id: "one sentence",
		says: "names only, and one slot saying what the cursor is on · shipped",
		render: OneSentence,
	},
	{
		id: "one line",
		says: "a description per row, clamped. the duplicate survives",
		render: OneLine,
	},
	{
		id: "bare",
		says: "no sentences at all. throws away what list_models sent",
		render: Bare,
	},
] as const;

export default function AgentModelLookFrame() {
	const models = useModels() ?? [];
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex shrink-0 items-baseline gap-3 border-border border-b bg-surface/40 px-6 py-2">
				<span className="font-mono text-sm text-text leading-4">model menu</span>
				<span className="min-w-0 flex-1 font-mono text-2xs text-muted/70 leading-3">
					#186 settled: one sentence. drawn four ways on the real `list_models` reply, opus (1m) picked, xhigh set.
				</span>
			</div>
			<div className="flex min-h-0 flex-1 items-start gap-8 overflow-auto p-6">
				{TAKES.map((take) => (
					<div key={take.id} className="flex shrink-0 flex-col gap-3">
						<div className="flex flex-col gap-1">
							<span className="font-mono text-xs text-text leading-4">{take.id}</span>
							<span className="w-[300px] font-mono text-2xs text-muted/45 leading-[1.5]">{take.says}</span>
						</div>
						<take.render models={models} />
					</div>
				))}
			</div>
		</div>
	);
}
