import { type ReactNode, useEffect, useRef, useState } from "react";
import { splitClass } from "../../daemon/class-write";
import type { CompiledTheme, Geometry, HandOp, RungRead } from "../api";
import { fetchTheme, readRungs } from "../api";
import { cn } from "../cn";
import { PropertiesIcon } from "../icons";
import {
	BASE,
	bareToken,
	type Scope,
	sameScope,
	scopeKey,
	scopeLabel,
	scopesOf,
	scopeWhen,
	type TokenState,
	tokenState,
	tokensUnder,
	variantsOf,
} from "./properties-scope";
import type { PickedHit } from "./protocol";
import {
	COLLAPSED_BELOW,
	GRIP_CLASS,
	GRIP_HAIR,
	PROPERTIES_WIDTH,
	STRIP_WIDTH,
	useRailDrag,
	useRailWidth,
} from "./rail-width";
import { PanelCaret } from "./sidebar";

/**
 * The properties rail (#256): the right column, back, and holding one thing.
 *
 * The canvas lost its inspector — `agent-rail.tsx` still says "elements died
 * with the inspector" — and direct manipulation wants that column again, so
 * properties are what the column shows and the agent is reached, when its
 * experiment is on at all, by pressing its 44px strip. Never a tab row: the
 * agent rail killed its own on purpose, and two rails side by side do not fit
 * — 300 plus 420 leaves 472px of field at 1440.
 *
 * This is the shell: the crumbs, the scope bar, the empty states and the
 * source line. What every row reads and writes is the property model (#257),
 * which is also where the compiled theme reaches the canvas — the scope bar's
 * breakpoints are this project's own because of it. The rows between them, and
 * the seven primitives they need, are #258.
 *
 * Everything it draws about an element is read off the file rather than off
 * the document, through the same fresh parse the write lane runs. That is what
 * lets a crumb say the name the author wrote, the source line show the literal
 * a splice would land in, and a refusal read as the reason a write would have
 * given rather than as an absence.
 */

/** the row's own type scale, which is the design's: a label, a value, an aside */
const LABEL = "font-mono text-2xs leading-3";
const VALUE = "font-mono text-sm leading-4";
const FAINT = "font-mono text-2xs text-muted/50 leading-3";
const BOX =
	"rounded-xs border border-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";

/** the smallest a frame may be dragged or typed to, which is the canvas's own floor */
const FRAME_FLOOR = 80;

/**
 * What the canvas is holding, as the rail reads it.
 *
 * One rung at a time is what a properties surface means, so a selection of
 * several says how many and nothing else: there is no honest single value to
 * put in a field that stands for three elements.
 */
export type Held =
	| { kind: "frame"; name: string; geometry: Geometry }
	| { kind: "frames"; count: number }
	| { kind: "element"; frame: string; chain: readonly PickedHit[]; selector: string }
	| { kind: "elements"; count: number };

export interface PropertiesActs {
	/** a crumb press: one rung of the ancestry, or the frame at the root of it */
	onRung: (frame: string, hit: PickedHit | null) => void;
	/** the frame's own geometry, which is `frame.json` and never source */
	onGeometry: (name: string, patch: Partial<Geometry>) => void;
	/** the write lane: gated, spliced, and recorded on the canvas's one undo stack */
	onWrite: (frame: string, selector: string, ops: readonly HandOp[]) => void;
}

export function PropertiesRail({
	project,
	held,
	acts,
	revision,
	shut,
	onOpen,
}: {
	project: string;
	held: Held | null;
	acts: PropertiesActs;
	/** bumps when the held frame's document reloads, so the read follows the file */
	revision: number;
	/** the agent has the column: the rail stands as its strip until it is pressed */
	shut: boolean;
	onOpen: () => void;
}) {
	const [width, setWidth] = useRailWidth("properties", PROPERTIES_WIDTH);
	const { dragging, grip } = useRailDrag(width, setWidth, PROPERTIES_WIDTH);
	const collapsed = shut || width <= COLLAPSED_BELOW;

	return (
		<aside
			aria-label="Properties"
			data-properties-rail=""
			style={{ width: collapsed ? STRIP_WIDTH : width }}
			className={cn(
				"relative z-20 h-full shrink-0 overflow-hidden border-border border-l bg-bg",
				dragging
					? ""
					: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			{collapsed ? (
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand properties"
						onClick={() => {
							// the strip is the switch: pressing it takes the column back
							// from the agent, and opens the rail if a drag had shut it
							onOpen();
							if (width <= COLLAPSED_BELOW) setWidth(PROPERTIES_WIDTH);
						}}
						className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
					>
						<PropertiesIcon />
					</button>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					<Body
						project={project}
						held={held}
						acts={acts}
						revision={revision}
						onCollapse={() => setWidth(STRIP_WIDTH)}
					/>
				</div>
			)}

			{/* the grip is not offered while the agent has the column: a drag then would
			    resize a rail nobody can see (#256) */}
			{shut ? null : (
				<button type="button" aria-label="Resize properties" {...grip} className={GRIP_CLASS}>
					<span className={GRIP_HAIR} />
				</button>
			)}
		</aside>
	);
}

/* ---------- what the file says about the ancestry ---------- */

/** Which rung of the ancestry is held, or -1 when the chain no longer carries it. */
function rungOf(held: Held | null): number {
	return held?.kind === "element" ? held.chain.findIndex((hit) => hit.selector === held.selector) : -1;
}

/** The rungs' stamps, in rung order, down to and including the one held. */
function stampsOf(held: Held | null): { frame: string; sources: string[] } | null {
	if (held?.kind !== "element") return null;
	const rung = rungOf(held);
	if (rung < 0) return null;
	const sources = held.chain.slice(0, rung + 1).map((hit) => hit.source ?? "");
	return sources.every((source) => source !== "") ? { frame: held.frame, sources } : null;
}

/**
 * The read the rail draws from, kept per ancestry.
 *
 * A read in flight never blanks what is on screen: the crumbs fall back to the
 * live tags, so a fresh pick draws immediately and gains its authored names a
 * beat later. A frame that reloads — an agent's edit, or the rail's own write
 * — re-reads, because the literal on screen has to be the one in the file.
 */
function useRungs(project: string, held: Held | null, revision: number): RungRead[] | null {
	const [rungs, setRungs] = useState<RungRead[] | null>(null);
	const ask = stampsOf(held);
	/**
	 * The whole ask on one line: the revision of the file, the frame, the stamps.
	 *
	 * A string, because what has to change for a re-read is the ask itself — and
	 * an object rebuilt on every render is not that, so the rail would ask the
	 * daemon again every time the pointer moved.
	 */
	const asked = ask === null ? "" : [String(revision), ask.frame, ...ask.sources].join("\n");
	useEffect(() => {
		const [, frame, ...sources] = asked.split("\n");
		if (frame === undefined || sources.length === 0) {
			setRungs(null);
			return;
		}
		let live = true;
		void readRungs(project, frame, sources).then((read) => {
			if (live) setRungs(read ?? null);
		});
		return () => {
			live = false;
		};
	}, [project, asked]);
	return rungs;
}

/**
 * The compiled theme, which is what every menu in the rail offers (#257).
 *
 * It is read per project and again whenever the held frame's document reloads:
 * tokens.css is one of that document's own inputs, so a theme edit is a reload,
 * and the daemon answers a re-read off its own cache when nothing changed.
 * Nothing until the read lands, which is a rail with no menus rather than one
 * offering Tailwind's defaults over a project that renamed them.
 */
function useTheme(project: string, revision: number): CompiledTheme | null {
	const [theme, setTheme] = useState<CompiledTheme | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is not read in here, it is the trigger — a document that reloaded may have reloaded because tokens.css changed
	useEffect(() => {
		let live = true;
		void fetchTheme(project).then((read) => {
			if (live && read !== undefined) setTheme(read);
		});
		return () => {
			live = false;
		};
	}, [project, revision]);
	return theme;
}

/* ---------- the rail itself ---------- */

function Body({
	project,
	held,
	acts,
	revision,
	onCollapse,
}: {
	project: string;
	held: Held | null;
	acts: PropertiesActs;
	revision: number;
	onCollapse: () => void;
}) {
	const rungs = useRungs(project, held, revision);
	const theme = useTheme(project, revision);
	const [scope, setScope] = useState<Scope>(BASE);
	/** a scope opened by the `+` and not yet written to: it stands until it is filled or left */
	const [opened, setOpened] = useState<Scope[]>([]);

	const element = held?.kind === "element" ? held : null;
	const rung = rungOf(held);
	const read = rungs === null || rung < 0 ? undefined : rungs[rung];
	const literal = read?.className ?? "";
	const identity = element === null ? "" : `${element.frame} ${element.selector}`;

	// the scope is the element's, not the rail's: a fresh rung starts at the base
	const before = useRef(identity);
	if (before.current !== identity) {
		before.current = identity;
		if (scope.length > 0) setScope(BASE);
		if (opened.length > 0) setOpened([]);
	}

	/**
	 * The literal this rung was holding when it was picked.
	 *
	 * A token that is not in it is one the hands put there, and the source line
	 * reads it in thread colour — which is how you tell what you changed from
	 * what the agent wrote. It is taken from the first read of a rung and held
	 * until another rung is picked, because a write of your own re-reads the
	 * file and the answer must not become "everything is original again".
	 */
	const written = useRef<{ identity: string; tokens: ReadonlySet<string> }>({ identity: "", tokens: new Set() });
	if (read !== undefined && written.current.identity !== identity) {
		written.current = { identity, tokens: new Set(splitClass(literal)) };
	}
	const original = written.current.identity === identity ? written.current.tokens : new Set<string>();

	const carried = scopesOf(literal);
	const scopes = [...carried];
	for (const extra of opened) if (!scopes.some((known) => sameScope(known, extra))) scopes.push(extra);
	const live = scopes.some((known) => sameScope(known, scope)) ? scope : BASE;

	return (
		<>
			<Head held={held} rungs={rungs} acts={acts} onCollapse={onCollapse} />
			{element === null ? null : (
				<ScopeBar
					scopes={scopes}
					variants={variantsOf(theme)}
					scope={live}
					ok={read?.refusal === undefined}
					onScope={setScope}
					onAdd={(next) => {
						setOpened((standing) => [...standing, next]);
						setScope(next);
					}}
					onRemove={(gone) => {
						const ops = tokensUnder(literal, gone).map(
							(token): HandOp => ({
								kind: "set-class",
								source: read?.source ?? "",
								token: bareToken(token),
								scope: scopeKey(gone),
								remove: true,
							}),
						);
						if (ops.length > 0) acts.onWrite(element.frame, element.selector, ops);
						setOpened((standing) => standing.filter((extra) => !sameScope(extra, gone)));
						setScope(BASE);
					}}
				/>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
				{held === null ? <Empty says="select an element" /> : null}
				{held?.kind === "frames" ? <Empty says={`${held.count} frames`} /> : null}
				{held?.kind === "elements" ? <Empty says={`${held.count} elements`} /> : null}
				{held?.kind === "frame" ? <FrameGeometry name={held.name} geometry={held.geometry} acts={acts} /> : null}
				{element === null ? null : <SourceLine read={read} scope={live} original={original} />}
			</div>
		</>
	);
}

function Empty({ says }: { says: string }) {
	return (
		<div className="flex h-9 items-center px-2.5">
			<span className={cn("text-muted/50", VALUE)}>{says}</span>
		</div>
	);
}

/* ---------- the crumbs ---------- */

/**
 * `cart / main / CartRow`, and a press on any of them climbs.
 *
 * The frame is the root of the chain, which is what tells it apart from its
 * root element: the two are the same rectangle on screen and different things
 * to adjust, so the crumbs are the only place that says which one is held
 * (#254). A name is the one the author wrote where the file could be read, and
 * the live tag until it can be.
 */
function Head({
	held,
	rungs,
	acts,
	onCollapse,
}: {
	held: Held | null;
	rungs: RungRead[] | null;
	acts: PropertiesActs;
	onCollapse: () => void;
}) {
	const element = held?.kind === "element" ? held : null;
	const rung = rungOf(held);
	const walked = element === null || rung < 0 ? [] : element.chain.slice(0, rung + 1);
	const frame = element?.frame ?? (held?.kind === "frame" ? held.name : null);
	const read = rungs === null || rung < 0 ? undefined : rungs[rung];
	return (
		<div className="shrink-0 border-border border-b">
			<div className="flex h-9 items-center gap-2 px-2.5">
				<span data-properties-crumbs="" className={cn("flex min-w-0 flex-1 items-center gap-1", VALUE)}>
					{frame === null ? (
						<span className={cn("text-muted/50", VALUE)}>properties</span>
					) : (
						<Crumb
							name={frame}
							last={walked.length === 0}
							squeezes={walked.length > 0}
							onPress={() => acts.onRung(frame, null)}
						/>
					)}
					{element === null
						? null
						: walked.map((hit, index) => (
								<Crumb
									key={hit.selector}
									name={rungs?.[index]?.name ?? hit.tag}
									last={index === walked.length - 1}
									squeezes={index < walked.length - 1}
									onPress={() => acts.onRung(element.frame, hit)}
								/>
							))}
				</span>
				{element === null ? null : <span className={cn("shrink-0", FAINT)}>{element.chain[rung]?.tag ?? ""}</span>}
				<CollapseCaret onCollapse={onCollapse} />
			</div>
			{read?.refusal === undefined ? null : (
				<div className="flex h-5 items-center px-2.5 pb-1">
					<span className={cn("min-w-0 truncate", FAINT)}>{read.refusal.says}</span>
				</div>
			)}
		</div>
	);
}

function Crumb({
	name,
	last,
	squeezes,
	onPress,
}: {
	name: string;
	last: boolean;
	/** an ancestor gives its width up first, so the rung that is held always reads */
	squeezes: boolean;
	onPress: () => void;
}) {
	return (
		<span className={cn("flex items-center gap-1", squeezes ? "min-w-0" : "shrink-0")}>
			<button
				type="button"
				onClick={onPress}
				className={cn(
					"cursor-pointer truncate rounded-xs px-0.5 focus:outline-none focus-visible:bg-surface",
					last ? "text-thread" : "text-muted hover:text-text",
				)}
			>
				{name}
			</button>
			{last ? null : <span className="shrink-0 text-muted/30">/</span>}
		</span>
	);
}

function CollapseCaret({ onCollapse }: { onCollapse: () => void }) {
	return (
		<button
			type="button"
			aria-label="Collapse properties"
			onClick={onCollapse}
			className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors hover:text-text"
		>
			<PanelCaret dir="right" className="h-3.5 w-2.5" />
		</button>
	);
}

/* ---------- the scope bar ---------- */

/**
 * `base · hover: · md: · +`, and the rail edits under whichever is lit.
 *
 * It wraps to a second line past the rail's width rather than scrolling
 * sideways or growing an arrow: a chip you cannot see is a state you forget you
 * are in. The lit chip carries an `×` that drops every token under it at once,
 * because abandoning a hover state should not mean removing tokens one at a
 * time; a scope emptied of its last token stops being one and the selection
 * falls back to the base.
 */
function ScopeBar({
	scopes,
	variants,
	scope,
	ok,
	onScope,
	onAdd,
	onRemove,
}: {
	scopes: readonly Scope[];
	/** what this project's own theme has, which is where its breakpoints come from */
	variants: readonly { prefix: string; when: string }[];
	scope: Scope;
	ok: boolean;
	onScope: (scope: Scope) => void;
	onAdd: (scope: Scope) => void;
	onRemove: (scope: Scope) => void;
}) {
	const [opening, setOpening] = useState(false);
	const free = variants.filter((variant) => !scopes.some((known) => sameScope(known, [variant.prefix])));
	return (
		<div className="relative flex min-h-8 shrink-0 flex-wrap items-center gap-1 border-border border-b px-2.5 py-1.5">
			{scopes.map((candidate) => {
				const on = sameScope(candidate, scope);
				const when = scopeWhen(candidate);
				return (
					<span key={scopeLabel(candidate)} className="flex shrink-0 items-center">
						<button
							type="button"
							aria-pressed={on}
							{...(when === undefined ? {} : { title: when })}
							onClick={() => onScope(candidate)}
							className={cn(
								"h-5 shrink-0 rounded-xs border px-1.5 focus:outline-none focus-visible:bg-raised",
								LABEL,
								ok ? "cursor-pointer" : "cursor-default",
								on ? "border-border-raised bg-raised text-text" : "border-transparent text-muted/60",
								ok && !on && "hover:border-border hover:text-text",
								!ok && "text-muted/35",
								!ok && on && "bg-surface",
							)}
						>
							{scopeLabel(candidate)}
						</button>
						{on && ok && candidate.length > 0 ? (
							<button
								type="button"
								aria-label={`remove ${scopeLabel(candidate)}`}
								title={`remove every ${scopeLabel(candidate)} token`}
								onClick={() => onRemove(candidate)}
								className={cn("shrink-0 cursor-pointer rounded-xs px-0.5 text-muted/50 hover:text-text", VALUE)}
							>
								×
							</button>
						) : null}
					</span>
				);
			})}
			{/* a refused literal keeps its `+` and loses its box: a control that
			    vanishes reads as a bug, and a greyed one teaches you the shape of
			    your own code (#256) */}
			{free.length === 0 ? null : (
				<button
					type="button"
					aria-label="Open a scope"
					aria-expanded={opening}
					disabled={!ok}
					onClick={() => setOpening((open) => !open)}
					className={cn(
						"h-5 shrink-0 rounded-xs px-1.5",
						LABEL,
						ok ? "cursor-pointer text-muted/50 hover:text-text" : "cursor-default text-muted/25",
					)}
				>
					+
				</button>
			)}
			{opening ? (
				<div className="absolute top-full right-2.5 z-40 max-h-64 overflow-y-auto rounded-sm border border-border-raised bg-surface py-1 shadow-none">
					{free.map((variant) => (
						<button
							key={variant.prefix}
							type="button"
							onClick={() => {
								setOpening(false);
								onAdd([variant.prefix]);
							}}
							className={cn(
								"flex w-full cursor-pointer items-center gap-3 whitespace-nowrap px-2.5 py-1 text-left text-muted hover:bg-raised hover:text-text",
								VALUE,
							)}
						>
							<span className="flex-1">{`${variant.prefix}:`}</span>
							<span className={FAINT}>{variant.when}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

/* ---------- the frame: frame.json, in raw pixels ---------- */

const AXES = [
	{ key: "x", of: "position" },
	{ key: "y", of: "position" },
	{ key: "w", of: "size" },
	{ key: "h", of: "size" },
] as const;

function FrameGeometry({ name, geometry, acts }: { name: string; geometry: Geometry; acts: PropertiesActs }) {
	const write = (key: "x" | "y" | "w" | "h", value: number) => {
		const floored = key === "w" || key === "h" ? Math.max(FRAME_FLOOR, value) : value;
		if (floored === geometry[key]) return;
		acts.onGeometry(name, { [key]: floored });
	};
	return (
		<>
			{(["position", "size"] as const).map((section) => (
				<Section key={section} name={section} reason="frame.json">
					{AXES.filter((axis) => axis.of === section).map((axis) => (
						<Row
							key={axis.key}
							name={axis.key}
							onScrub={(units) => write(axis.key, geometry[axis.key] + units * 4)}
						>
							<NumField
								value={String(Math.round(geometry[axis.key]))}
								readout="px"
								onCommit={(typed) => {
									const next = Number.parseInt(typed, 10);
									if (!Number.isNaN(next)) write(axis.key, next);
								}}
								onStep={(units) => write(axis.key, geometry[axis.key] + units * 4)}
							/>
						</Row>
					))}
				</Section>
			))}
		</>
	);
}

/* ---------- the source line ---------- */

/**
 * The element's literal, token by token, and where it is written.
 *
 * What is out of the live scope reads dim, so the bar above is visibly a lens
 * over one literal rather than a filter that hides the rest of it. A className
 * the hands may not write says so instead of showing a literal nobody can
 * touch: the expression is the whole of the answer there.
 */
/** the ink each reading takes: the thread for what the hands wrote, quiet for the rest */
const INK: Readonly<Record<TokenState, string>> = {
	spliced: "text-thread",
	"in-scope": "text-muted",
	"out-of-scope": "text-muted/40",
};

/**
 * The literal's words, each with something to be known by.
 *
 * A className is a list rather than a set — nothing stops an author writing the
 * same word twice — so a token's identity is itself and which time it is said.
 */
function tokensWritten(className: string): { token: string; at: string }[] {
	const said = new Map<string, number>();
	return className
		.split(/\s+/)
		.filter((token) => token !== "")
		.map((token) => {
			const time = (said.get(token) ?? 0) + 1;
			said.set(token, time);
			return { token, at: `${token}#${time}` };
		});
}

function SourceLine({
	read,
	scope,
	original,
}: {
	read: RungRead | undefined;
	scope: Scope;
	/** the tokens the file was written with; anything else is the hands' own */
	original: ReadonlySet<string>;
}) {
	if (read === undefined) return null;
	const tokens = tokensWritten(read.className);
	const where = read.line === undefined ? read.path : `${read.path}:${read.line}`;
	return (
		<Section name="className" {...(read.mapped === true ? { reason: "one row of many" } : {})}>
			<div className="flex flex-col gap-1.5 px-2.5 py-2">
				<p data-properties-source="" className={cn("break-all", VALUE)}>
					{read.refusal?.expression !== undefined ? (
						<span className="text-muted">{read.refusal.expression}</span>
					) : tokens.length === 0 ? (
						<span className="text-muted/50">null</span>
					) : (
						tokens.map(({ token, at }, index) => (
							<span key={at} className={INK[tokenState(token, scope, original)]}>
								{index > 0 ? " " : ""}
								{token}
							</span>
						))
					)}
				</p>
				{where === undefined ? null : <span className={cn("min-w-0 truncate", FAINT)}>{where}</span>}
			</div>
		</Section>
	);
}

/* ---------- the row, the section and the one field the shell needs ---------- */

function Section({ name, reason, children }: { name: string; reason?: string; children: ReactNode }) {
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}

/** the CSS name on the left, one control on the right, a hairline under each */
function Row({
	name,
	onScrub,
	children,
}: {
	name: string;
	/** a numeric row: dragging the label steps the value by the units crossed */
	onScrub?: (units: number) => void;
	children: ReactNode;
}) {
	const scrub = useRef<{ from: number; sent: number } | null>(null);
	return (
		<div className="grid h-7 grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5">
			<span
				onPointerDown={(event) => {
					if (onScrub === undefined) return;
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					scrub.current = { from: event.clientX, sent: 0 };
				}}
				onPointerMove={(event) => {
					const held = scrub.current;
					if (held === null || onScrub === undefined) return;
					const units = Math.round((event.clientX - held.from) / 4);
					if (units === held.sent) return;
					onScrub(units - held.sent);
					held.sent = units;
				}}
				onPointerUp={(event) => {
					if (scrub.current === null) return;
					event.currentTarget.releasePointerCapture(event.pointerId);
					scrub.current = null;
				}}
				onPointerCancel={() => {
					scrub.current = null;
				}}
				className={cn(
					"select-none truncate text-muted",
					LABEL,
					onScrub === undefined ? "" : "cursor-ew-resize hover:text-text",
				)}
			>
				{name}
			</span>
			<div className="flex min-w-0 items-center gap-1">{children}</div>
		</div>
	);
}

/**
 * A number, chrome-less until the pointer is on it.
 *
 * Arrows step one unit and shift steps ten, which is the same gesture the
 * label's scrub makes with the pointer. The draft is the field's own until it
 * is committed, so a half-typed number is never written.
 */
function NumField({
	value,
	readout,
	onCommit,
	onStep,
}: {
	value: string;
	readout?: string;
	onCommit: (typed: string) => void;
	onStep?: (units: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<label className={cn("flex min-w-0 flex-1 items-center gap-1 px-1", BOX)}>
			<input
				value={draft ?? value}
				spellCheck={false}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => event.target.select()}
				onBlur={() => {
					if (draft !== null && draft !== value) onCommit(draft);
					setDraft(null);
				}}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") {
						if (draft !== null && draft !== value) onCommit(draft);
						setDraft(null);
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(null);
						event.currentTarget.blur();
					}
					if ((event.key === "ArrowUp" || event.key === "ArrowDown") && onStep !== undefined) {
						event.preventDefault();
						setDraft(null);
						onStep((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
					}
				}}
				className={cn("min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted/40", VALUE)}
			/>
			{readout === undefined ? null : <span className={cn("shrink-0", FAINT)}>{readout}</span>}
		</label>
	);
}
