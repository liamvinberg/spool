import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { splitClass } from "../../daemon/class-write";
import type { RowElement } from "../../properties/rows";
import type { CompiledTheme, Geometry, ProjectAsset, RungRead } from "../api";
import { fetchTheme, listAssets, readRungs } from "../api";
import { cn } from "../cn";
import { MenuItem } from "./context-menu";
import { type AttributeField, blocksFields, fieldsFor } from "./properties-attributes";
import { useCompiler } from "./properties-compile";
import {
	BOX,
	FAINT,
	FileLink,
	LABEL,
	Menu,
	NumField,
	type Option,
	popoverAt,
	Row,
	Section,
	TextField,
	useCloseOnPressAway,
	VALUE,
} from "./properties-fields";
import {
	BASE,
	type Scope,
	sameScope,
	scopedClass,
	scopeKey,
	scopeLabel,
	scopesOf,
	scopeWhen,
	type TokenState,
	tokenState,
	variantsOf,
} from "./properties-scope";
import { AddClassRow, PropertySections, spellingControls, type View } from "./properties-sections";
import type { PropertyControls, PropertyValue } from "./property-controls";
import type { PickedHit } from "./protocol";
import { PanelCaret } from "./sidebar";

/**
 * The properties rail (#256): the right column, back, and holding one thing.
 *
 * The canvas lost its inspector — `agent-rail.tsx` still says "elements died
 * with the inspector" — and direct manipulation wants that column again, so
 * properties are what the column shows by default. Never a tab row: the agent
 * rail killed its own on purpose, and two rails side by side do not fit — 300
 * plus 420 leaves 472px of field at 1440. Where this surface stands, how wide
 * it is and how it is reached are all `dock.tsx`'s; what arrives here is a
 * width and one act, which is that the head's caret shuts the column.
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
	// a page standing on the field (#265). It has nothing editable: a page's name
	// is its folder, its place is the drag, and its size is derived from what is
	// inside it — so what the rail can say is what it is and how much is in it
	| { kind: "page"; page: string; name: string; count: number }
	| { kind: "element"; frame: string; chain: readonly PickedHit[]; selector: string }
	/**
	 * Several elements held at once (#323).
	 *
	 * The rail draws the rows they share and says "Mixed" where they disagree,
	 * and a write from it goes to every one of them. That needs each pick's own
	 * literal, so the ask is their stamps rather than one ancestry — and it is
	 * one frame's, because a selection spread over two is two writes. `picks` is
	 * empty where they are spread, which is the count and nothing else.
	 */
	| { kind: "elements"; count: number; frame: string | null; picks: readonly PickedHit[] };

/**
 * A gesture in flight on the canvas, as the rail reads it (#259).
 *
 * A resize writes nothing until it is let go, so the fields would sit still
 * through the whole drag if they read only the file. The canvas supplies the
 * measured box while the drag is live.
 */
export interface RailPreview {
	box: { w: number; h: number };
}

export interface PropertiesActs {
	onAsk?: () => void;
	/**
	 * The class write lane for the rung held (#315): a value previews on the
	 * element in the frame at once and lands in the file as one class change
	 * on Enter or blur. Nothing when no rung is held that the canvas can
	 * address, and the rows draw without a gesture.
	 */
	property?: PropertyControls | null;
	/** the file a refusal names, handed out the way the frame's own source path is */
	onOpenFile?: (path: string, line: number) => void;
	/** a crumb press: one rung of the ancestry, or the frame at the root of it */
	onRung: (frame: string, hit: PickedHit | null) => void;
	/** the frame's own geometry, which is `frame.json` and never source */
	onGeometry: (name: string, patch: Partial<Geometry>) => void;
	/** a scrub tick: the screen follows, the file waits for the pointer to lift */
	onGeometryPreview: (name: string, patch: Partial<Geometry>) => void;
	/** the scrub let go: one write and one undo slot for the whole gesture */
	onGeometryCommit: (name: string, before: Geometry) => void;
	/**
	 * A structural write (#317): hide, show, or one attribute.
	 *
	 * It carries the fingerprint this rung was read out of, because that is the
	 * file the row drew — the same promise every other op in the lane keeps.
	 */
	onElement: (
		frame: string,
		selector: string,
		at: { source: string; fingerprint: string },
		act: "hide" | "show" | "attribute",
		attribute?: { name: string; value: string },
	) => void;
	/**
	 * The asset swap (#260): the one hand edit that writes a file.
	 *
	 * The picture and the splice land together, so it carries the fingerprint
	 * rather than being asked about first — a gate would answer about a file the
	 * swap is about to rewrite anyway.
	 */
	onSwap: (
		frame: string,
		selector: string,
		at: { source: string; fingerprint: string },
		put: { file: File } | { asset: string },
	) => void;
}

export function PropertiesRail({
	recovery,
	project,
	held,
	rungs,
	theme,
	acts,
	revision,
	reloads,
	preview = null,
	width,
	onCollapse,
}: {
	recovery?: ReactNode;
	project: string;
	held: Held | null;
	/** the selection's one read (#256), indexed by rung; the canvas owns it */
	rungs: (RungRead | undefined)[] | null;
	/** the compiled theme every menu in the rail offers, read once per project */
	theme: CompiledTheme | null;
	acts: PropertiesActs;
	/** the canvas gesture in flight, which the fields tick in until it lands */
	preview?: RailPreview | null;
	/** bumps on the held frame's reloads and on the hand's own saves: what the folder holds moved */
	revision: number;
	/** bumps only on a reload, which is the one thing that could have changed the theme */
	reloads: number;
	/** what the dock has given this surface, which is its own remembered width */
	width: number;
	/** the caret in the head: it shuts the column rather than this rail (`dock.tsx`) */
	onCollapse: () => void;
}) {
	return (
		<section
			aria-label="Properties"
			data-properties-rail=""
			style={{ width }}
			className="flex h-full min-w-[200px] flex-col overflow-hidden border-border border-l bg-bg"
		>
			<Body
				project={project}
				held={held}
				rungs={rungs}
				theme={theme}
				acts={acts}
				revision={revision}
				reloads={reloads}
				preview={preview}
				onCollapse={onCollapse}
			/>
			{recovery}
		</section>
	);
}

/* ---------- what the file says about the ancestry ---------- */

/** Which rung of the ancestry is held, or -1 when the chain no longer carries it. */
export function rungOf(held: Held | null): number {
	return held?.kind === "element" ? held.chain.findIndex((hit) => hit.selector === held.selector) : -1;
}

/**
 * The rungs' stamps, in rung order, down to and including the one held, and
 * which rung of the chain each one belongs to.
 *
 * A rung the file has no stamp for — DOM some code drew — is left out of the
 * ask rather than blanking the whole read, so the rungs above and below it
 * still say what the file calls them.
 */
export function stampsOf(held: Held | null): { frame: string; sources: string[]; rungs: number[] } | null {
	if (held?.kind === "elements") {
		if (held.frame === null) return null;
		const sources: string[] = [];
		const rungs: number[] = [];
		for (const [index, hit] of held.picks.entries()) {
			if (hit.source === null || hit.source === "") continue;
			sources.push(hit.source);
			rungs.push(index);
		}
		return sources.length === 0 ? null : { frame: held.frame, sources, rungs };
	}
	if (held?.kind !== "element") return null;
	const rung = rungOf(held);
	if (rung < 0) return null;
	const sources: string[] = [];
	const rungs: number[] = [];
	for (const [index, hit] of held.chain.slice(0, rung + 1).entries()) {
		const source = hit.source ?? "";
		if (source === "") continue;
		sources.push(source);
		rungs.push(index);
	}
	return sources.length === 0 ? null : { frame: held.frame, sources, rungs };
}

/**
 * The one read behind everything a selection draws (#256, #259).
 *
 * The whole ancestry in one ask, answered once per selection and shared by
 * every reader of it: the rail's crumbs, scope bar and rows, and the ring's
 * own question of which handles the file leaves live. Two reads of the same
 * rungs was two round trips saying the same thing.
 *
 * What comes back is scattered back onto the chain, so a caller indexes it by
 * rung and gets nothing where a rung had no stamp to ask about. A read in
 * flight is nothing rather than the last rung's answer: crumbs fall back to
 * the live tags for a beat, and a ring wearing the previous element's answer
 * would offer a handle this one may not have.
 */
export function useRungs(project: string, held: Held | null, revision: number): (RungRead | undefined)[] | null {
	const [answered, setAnswered] = useState<{ asked: string; on: string; rungs: RungRead[] } | null>(null);
	const ask = stampsOf(held);
	/**
	 * The whole ask on one line: the revision of the file, the frame, the stamps.
	 *
	 * A string, because what has to change for a re-read is the ask itself — and
	 * an object rebuilt on every render is not that, so the rail would ask the
	 * daemon again every time the pointer moved.
	 */
	const asked = ask === null ? "" : [String(revision), ask.frame, ...ask.sources].join("\n");
	/** which element the answer is about, which a re-read of it does not change */
	const on =
		held?.kind === "element"
			? `${held.frame}\n${held.selector}`
			: held?.kind === "elements"
				? `${held.frame}\n${held.picks.map((hit) => hit.selector).join(" ")}`
				: "";
	useEffect(() => {
		const [, frame, ...sources] = asked.split("\n");
		if (frame === undefined || sources.length === 0) return;
		let live = true;
		void readRungs(project, frame, sources).then((read) => {
			if (live && read !== undefined) setAnswered({ asked, on, rungs: read });
		});
		return () => {
			live = false;
		};
	}, [project, asked, on]);
	if (ask === null || answered === null) return null;
	// A re-read of the element already answered for is the hand's own write
	// coming back, and its rows go on saying what they said until it lands
	// (#321). Blanking there took every reading off the rail and every handle
	// off the ring for a round trip after each property change — a flash that
	// reads as the frame reloading, on the one gesture that reloads nothing.
	if (answered.asked !== asked && (on === "" || answered.on !== on)) return null;
	const byRung: (RungRead | undefined)[] = [];
	for (const [index, rung] of ask.rungs.entries()) byRung[rung] = answered.rungs[index];
	return byRung;
}

/**
 * The compiled theme, which is what every menu in the rail offers (#257).
 *
 * One read per project, kept for as long as the canvas is open, and asked
 * again only when a held frame's document reloads: tokens.css is one of that
 * document's own inputs, so a theme edit is a reload. A hand's own save is
 * not — it writes a class into frame source and leaves the theme alone — so
 * nothing about committing an edit asks for this again.
 */
export function useTheme(project: string, reloads: number): CompiledTheme | null {
	const [theme, setTheme] = useState<CompiledTheme | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloads` is not read in here, it is the trigger — a document that reloaded may have reloaded because tokens.css changed
	useEffect(() => {
		let live = true;
		void fetchTheme(project).then((read) => {
			if (live && read !== undefined) setTheme(read);
		});
		return () => {
			live = false;
		};
	}, [project, reloads]);
	return theme;
}

/* ---------- the rail itself ---------- */

function Body({
	project,
	held,
	rungs,
	theme,
	acts,
	revision,
	reloads,
	preview,
	onCollapse,
}: {
	project: string;
	held: Held | null;
	rungs: (RungRead | undefined)[] | null;
	theme: CompiledTheme | null;
	acts: PropertiesActs;
	revision: number;
	reloads: number;
	preview: RailPreview | null;
	onCollapse: () => void;
}) {
	const compiler = useCompiler(project, reloads);
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
	/** true once the file's own literal is known, which is what a splice is measured against */
	const knownOriginal = written.current.identity === identity;
	const original = knownOriginal ? written.current.tokens : new Set<string>();

	const carried = scopesOf(literal);
	const scopes = [...carried];
	for (const extra of opened) if (!scopes.some((known) => sameScope(known, extra))) scopes.push(extra);
	const live = scopes.some((known) => sameScope(known, scope)) ? scope : BASE;

	const rowElement: RowElement = {
		tag: element === null ? "div" : (element.chain[rung]?.tag ?? "div"),
		className: literal,
		...(read?.refusal === undefined ? {} : { refusal: read.refusal }),
		...(read?.mapped === true ? { mapped: true } : {}),
	};
	const rect = element === null ? undefined : element.chain[rung]?.rect;
	/** what the frame draws this rung with, which is the rail's second source (#323) */
	const computed = element === null ? undefined : element.chain[rung]?.computed;
	// the imports the swap may choose from, asked for only where a rung has a
	// picture on it at all
	const assets = useAssets(project, element?.frame ?? null, rowElement.tag === "img", revision);
	const spelling = { scope: live, scoped: scopedClass(literal, live), theme };
	// the rows write through the canvas's lane once the file has been read
	// (#315): a write is measured against that read, so there is no gesture
	// to offer before it lands
	const lastPreviewed = useRef<{ property: string; value: PropertyValue } | null>(null);
	const view: View = {
		property: read === undefined ? null : spellingControls(spelling, acts.property ?? null, lastPreviewed),
		scope: live,
		scoped: spelling.scoped,
		base: scopedClass(literal, BASE),
		theme,
		element: rowElement,
		box: preview === null ? { w: rect?.w ?? 0, h: rect?.h ?? 0 } : preview.box,
		computed: computed ?? null,
		compiler,
		/**
		 * A token the hands put there rather than the file's author.
		 *
		 * It has to be one the literal actually carries: a row's reading may name a
		 * token the element does not wear verbatim — `border-x-2` read as the right
		 * edge answers `border-r-2` — and calling that a splice would paint the
		 * author's own work in thread colour.
		 */
		fresh: (token) =>
			knownOriginal &&
			token !== null &&
			splitClass(scopedClass(literal, live)).includes(token) &&
			!original.has(`${scopeKey(live)}${token}`),
	};

	return (
		<>
			<Head held={held} rungs={rungs} acts={acts} onCollapse={onCollapse} />
			{element === null ? null : (
				<ScopeBar
					scopes={scopes}
					variants={variantsOf(theme)}
					scope={live}
					ok={read?.refusal?.expression === undefined}
					onScope={setScope}
					onAdd={(next) => {
						setOpened((standing) => [...standing, next]);
						setScope(next);
					}}
				/>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
				{held === null ? <Empty says="select an element" /> : null}
				{held?.kind === "frames" ? <Empty says={`${held.count} frames`} /> : null}
				{held?.kind === "elements" ? <Empty says={`${held.count} elements`} /> : null}
				{held?.kind === "frame" ? (
					<FrameGeometry key={held.name} name={held.name} geometry={held.geometry} acts={acts} />
				) : null}
				{held?.kind === "page" ? <PageFacts held={held} /> : null}
				{/* keyed on the rung: a fold left open on one element is not an opinion
				    about the next one */}
				{element === null || read === undefined ? null : <PropertySections key={identity} view={view} />}
				{element === null || read === undefined ? null : (
					<Attributes
						html={element.chain[rung]?.outerHtml ?? ""}
						key={`${identity} attributes`}
						read={read}
						tag={rowElement.tag}
						assets={assets}
						hidden={splitClass(scopedClass(literal, BASE)).includes("hidden")}
						write={(act, attribute) => {
							if (read.fingerprint === undefined) return;
							const at = { source: read.source, fingerprint: read.fingerprint };
							acts.onElement(element.frame, element.selector, at, act, attribute);
						}}
						onSwap={(put) => {
							if (read.fingerprint === undefined) return;
							acts.onSwap(
								element.frame,
								element.selector,
								{ source: read.source, fingerprint: read.fingerprint },
								put,
							);
						}}
					/>
				)}
				{element === null ? null : <SourceLine read={read} scope={live} original={original} view={view} />}
			</div>
		</>
	);
}

function Empty({ says }: { says: string }) {
	return (
		<div className="flex h-9 items-center px-2.5">
			<span className={cn("text-muted", VALUE)}>{says}</span>
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
	rungs: (RungRead | undefined)[] | null;
	acts: PropertiesActs;
	onCollapse: () => void;
}) {
	const element = held?.kind === "element" ? held : null;
	const rung = rungOf(held);
	const walked = element === null || rung < 0 ? [] : element.chain.slice(0, rung + 1);
	const frame = element?.frame ?? (held?.kind === "frame" ? held.name : null);
	const read = rungs === null || rung < 0 ? undefined : rungs[rung];
	const steps: Step[] =
		frame === null
			? []
			: [
					{ key: `frame:${frame}`, name: frame, onPress: () => acts.onRung(frame, null) },
					...(element === null
						? []
						: walked.map((hit, index) => ({
								key: hit.selector,
								name: rungs?.[index]?.name ?? hit.tag,
								onPress: () => acts.onRung(element.frame, hit),
							}))),
				];
	return (
		<div className="shrink-0 border-border border-b">
			{/* the ruler under the trail is placed against this row, not against the page */}
			<div className="relative flex h-9 items-center gap-2 px-2.5">
				{steps.length === 0 ? (
					<span data-properties-crumbs="" className={cn("flex min-w-0 flex-1 items-center gap-1", VALUE)}>
						<span className={cn("text-muted", VALUE)}>properties</span>
					</span>
				) : (
					<Trail steps={steps} />
				)}
				{element === null ? null : <span className={cn("shrink-0", FAINT)}>{element.chain[rung]?.tag ?? ""}</span>}
				{acts.onAsk && held ? (
					<Menu
						label="Element actions"
						current={{ name: "⋯", token: null }}
						options={[{ name: "Ask agent", token: "ask" }]}
						ok
						onPick={() => acts.onAsk?.()}
						className="w-6 shrink-0"
					/>
				) : null}
				<CollapseCaret onCollapse={onCollapse} />
			</div>
			{read?.shared === undefined || read.path === undefined || read.line === undefined ? null : (
				// a shared definition (#318): the file it is written in, and how far
				// an edit to it reaches, said before anything is touched
				<div data-properties-shared="" className="flex h-5 items-center gap-2 px-2.5 pb-1">
					{acts.onOpenFile === undefined ? (
						<span className={cn("shrink-0", FAINT)}>{read.path.slice(read.path.lastIndexOf("/") + 1)}</span>
					) : (
						<FileLink path={read.path} line={read.line} onOpen={acts.onOpenFile} />
					)}
					{read.shared.frames === undefined ? null : (
						<span className={cn("min-w-0 truncate", FAINT)}>{usedIn(read.shared.frames.length)}</span>
					)}
				</div>
			)}
			{read?.refusal === undefined ? null : (
				<div className="flex h-5 items-center gap-2 px-2.5 pb-1">
					<span className={cn("min-w-0 truncate", FAINT)}>{read.refusal.says}</span>
					{read.refusal.line === undefined || read.path === undefined || acts.onOpenFile === undefined ? null : (
						<FileLink path={read.path} line={read.refusal.line} onOpen={acts.onOpenFile} />
					)}
				</div>
			)}
		</div>
	);
}

/** How far an edit to a shared definition reaches, as the import graph counts it. */
export function usedIn(frames: number): string {
	return `used in ${frames} frame${frames === 1 ? "" : "s"}`;
}

/** one crumb's worth of the trail: a name, and the rung a press on it climbs to */
interface Step {
	key: string;
	name: string;
	onPress: () => void;
}

/** the canvas menu's box, which the `…` opens a short one of */
const MENU_WIDTH = 200;
const MENU_ROW = 30;
const MENU_PAD = 8;

/**
 * The trail, showing the rungs nearest the one held and eliding the rest.
 *
 * A chain eight deep does not fit a 300px column, and the rule that let every
 * ancestor squeeze spent the width on `spoo… / d. / m… / d.` — a row that
 * names nothing and that nobody can press on purpose. So the frame at the root
 * and as many of the nearest rungs as fit read whole, and what is left over
 * collapses into a `…` that opens on the rungs it stands for. A trail should
 * always say something true about where you are, even when it cannot say all
 * of it.
 *
 * How many fit is measured rather than counted out, because the rail's width
 * is the reader's to drag (`rail-width.ts`). The ruler is the whole trail drawn
 * where nothing can see it: measuring the crumbs on screen would only ever say
 * how much of what is already shown fits, never whether one more would.
 */
function Trail({ steps }: { steps: readonly Step[] }) {
	const row = useRef<HTMLSpanElement | null>(null);
	const ruler = useRef<HTMLSpanElement | null>(null);
	const opener = useRef<HTMLButtonElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);
	const [near, setNear] = useState(steps.length - 1);
	const [menu, setMenu] = useState<{ chain: string; left: number; top: number } | null>(null);
	const shut = useCallback(() => setMenu(null), []);

	useLayoutEffect(() => {
		const box = row.current;
		const rule = ruler.current;
		if (box !== null && rule !== null) setNear(fitting(box.getBoundingClientRect().width, rule));
	});

	// the menu carries the trail it was opened on: a climb from anywhere else
	// would otherwise leave it standing, listing rungs nobody is under any more
	const chain = steps.map((step) => step.key).join(">");
	const at = menu?.chain === chain ? menu : null;
	useCloseOnPressAway(at !== null, shut, list, opener);

	const kept = Math.max(0, Math.min(near, steps.length - 1));
	const root = steps[0];
	const skipped = steps.slice(1, steps.length - kept);
	const nearest = steps.slice(steps.length - kept);

	const show = () => {
		const rect = opener.current?.getBoundingClientRect();
		if (rect === undefined) return;
		setMenu({ chain, ...popoverAt(rect, MENU_WIDTH, skipped.length * MENU_ROW + MENU_PAD) });
	};

	return (
		<>
			<span
				ref={row}
				data-properties-crumbs=""
				className={cn("flex min-w-0 flex-1 items-center gap-1 overflow-hidden", VALUE)}
			>
				{root === undefined ? null : (
					<Crumb name={root.name} last={steps.length === 1} squeezes={steps.length > 1} onPress={root.onPress} />
				)}
				{skipped.length === 0 ? null : (
					<Elision ref={opener} open={at !== null} onToggle={() => (at === null ? show() : shut())} />
				)}
				{nearest.map((step, index) => (
					<Crumb
						key={step.key}
						name={step.name}
						last={index === nearest.length - 1}
						squeezes={false}
						onPress={step.onPress}
					/>
				))}
			</span>
			{/* clipped to nothing rather than merely faded, so a long trail cannot
			    push the tag and the caret off the row while it is being measured */}
			<span aria-hidden="true" inert className="absolute top-0 left-0 h-0 w-0 overflow-hidden">
				<span ref={ruler} data-crumb-ruler="" className={cn("flex w-max items-center gap-1", VALUE)}>
					{root === undefined ? null : <Crumb name={root.name} last={false} squeezes={false} onPress={() => {}} />}
					<Elision open={false} onToggle={() => {}} />
					{steps.slice(1).map((step, index) => (
						<Crumb
							key={step.key}
							name={step.name}
							last={index === steps.length - 2}
							squeezes={false}
							onPress={() => {}}
						/>
					))}
				</span>
			</span>
			{at === null ? null : (
				<div
					ref={list}
					role="menu"
					aria-label="Skipped rungs"
					style={{ left: at.left, top: at.top }}
					className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
					onPointerDown={(event) => event.stopPropagation()}
				>
					{skipped.map((step) => (
						<MenuItem
							key={step.key}
							label={step.name}
							onClick={() => {
								shut();
								step.onPress();
							}}
						/>
					))}
				</div>
			)}
		</>
	);
}

/**
 * How many of the nearest rungs the row has room to draw whole.
 *
 * Read off the ruler, whose children are the whole trail with the `…` second,
 * so the gap the row sets between crumbs is measured here too rather than
 * restated as a number. The held rung is drawn whatever the answer: a trail
 * that names nothing is worse than one that runs past its edge.
 */
function fitting(available: number, ruler: HTMLElement): number {
	const boxes = [...ruler.children].map((child) => child.getBoundingClientRect());
	const root = boxes[0];
	const elision = boxes[1];
	if (root === undefined || elision === undefined) return 0;
	const gap = elision.left - root.right;
	const rungs = boxes.slice(2);
	const whole = rungs.reduce((width, box) => width + gap + box.width, root.width);
	if (whole <= available) return rungs.length;
	let width = root.width + gap + elision.width;
	for (let kept = 1; kept <= rungs.length; kept++) {
		width += gap + (rungs[rungs.length - kept]?.width ?? 0);
		if (width > available) return Math.max(1, kept - 1);
	}
	return rungs.length;
}

/** the face a crumb wears, worn by the `…` too so the ruler measures what will draw */
const FACE = "cursor-pointer truncate rounded-xs px-0.5 focus:outline-none focus-visible:bg-surface";

function Crumb({
	name,
	last,
	squeezes,
	onPress,
}: {
	name: string;
	last: boolean;
	/**
	 * The frame gives its width up first, and only once the elided trail has
	 * itself run out of room: everything the trail still draws reads whole.
	 */
	squeezes: boolean;
	onPress: () => void;
}) {
	return (
		<span className={cn("flex items-center gap-1", squeezes ? "min-w-0" : "shrink-0")}>
			<button
				type="button"
				onClick={onPress}
				className={cn(FACE, last ? "text-thread-strong" : "text-muted hover:text-text")}
			>
				{name}
			</button>
			{last ? null : <span className="shrink-0 text-muted">/</span>}
		</span>
	);
}

/**
 * The `…` the middle of the trail collapses into.
 *
 * It is a crumb like the others, so a press on it is the affordance the row
 * already teaches; what it opens is the canvas's own menu (`context-menu.tsx`)
 * rather than a list this surface invented, one item per rung it stands for,
 * outermost first.
 */
function Elision({ ref, open, onToggle }: { ref?: React.Ref<HTMLButtonElement>; open: boolean; onToggle: () => void }) {
	return (
		<span className="flex shrink-0 items-center gap-1">
			<button
				ref={ref}
				type="button"
				aria-label="Skipped rungs"
				aria-expanded={open}
				onClick={onToggle}
				className={cn(FACE, "text-muted hover:text-text", open && "bg-surface text-text")}
			>
				…
			</button>
			<span className="shrink-0 text-muted">/</span>
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
	/** take every token under a scope away; a rail with nothing to write through offers none */
	onRemove?: ((scope: Scope) => void) | undefined;
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
							data-scope-chip=""
							aria-pressed={on}
							{...(when === undefined ? {} : { title: when })}
							onClick={() => onScope(candidate)}
							className={cn(
								"h-5 shrink-0 rounded-xs border px-1.5 focus:outline-none focus-visible:bg-control",
								LABEL,
								ok ? "cursor-pointer" : "cursor-default",
								on ? "border-border-raised bg-control text-text" : "border-transparent text-muted/60",
								ok && !on && "hover:border-border hover:text-text",
								!ok && "text-muted/35",
								!ok && on && "bg-surface",
							)}
						>
							{scopeLabel(candidate)}
						</button>
						{on && ok && onRemove !== undefined && candidate.length > 0 ? (
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
								"flex w-full cursor-pointer items-center gap-3 whitespace-nowrap px-2.5 py-1 text-left text-muted hover:bg-control hover:text-text",
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
	// what the scrub started from: a whole drag is one write and one undo slot,
	// exactly as a corner drag is, so the file waits for the pointer to lift
	const scrubbed = useRef<Geometry | null>(null);
	const floor = (key: "x" | "y" | "w" | "h", value: number) =>
		key === "w" || key === "h" ? Math.max(FRAME_FLOOR, value) : value;
	const write = (key: "x" | "y" | "w" | "h", value: number) => {
		const floored = floor(key, value);
		if (floored === geometry[key]) return;
		acts.onGeometry(name, { [key]: floored });
	};
	const scrub = (key: "x" | "y" | "w" | "h", value: number) => {
		scrubbed.current ??= { ...geometry };
		const floored = floor(key, value);
		if (floored === geometry[key]) return;
		acts.onGeometryPreview(name, { [key]: floored });
	};
	const settle = () => {
		const before = scrubbed.current;
		scrubbed.current = null;
		if (before !== null) acts.onGeometryCommit(name, before);
	};
	const cancel = (key: "x" | "y" | "w" | "h") => {
		const before = scrubbed.current;
		scrubbed.current = null;
		if (before !== null) acts.onGeometryPreview(name, { [key]: before[key] });
	};
	return (
		<>
			{(["position", "size"] as const).map((section) => (
				<Section key={section} name={section} reason="frame.json">
					{AXES.filter((axis) => axis.of === section).map((axis) => (
						<Row
							key={axis.key}
							name={axis.key}
							onScrub={(units) => scrub(axis.key, geometry[axis.key] + units * 4)}
							onScrubEnd={settle}
							onScrubCancel={() => cancel(axis.key)}
						>
							<NumField
								value={String(Math.round(geometry[axis.key]))}
								readout="px"
								ok
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

/**
 * What the rail can say about a page (#265): what it is called, where it lives,
 * and how much is under it.
 *
 * Nothing is editable, and that is the point rather than an omission. A page's
 * name is its folder and the rail renames it; its place is the drag itself; its
 * size is derived from the frames inside it, so a field for it would be a scale
 * control on a picture and would mean nothing about the project.
 */
function PageFacts({ held }: { held: Extract<Held, { kind: "page" }> }) {
	const rows: readonly [string, string][] = [
		["name", held.name],
		["path", `frames/${held.page}`],
		["frames", String(held.count)],
	];
	return (
		<Section name="page" reason="design/frames">
			{rows.map(([name, value]) => (
				<Row key={name} name={name}>
					<span className={cn("min-w-0 truncate", VALUE)}>{value}</span>
				</Row>
			))}
		</Section>
	);
}

/* ---------- the string fields (#260) ---------- */

/**
 * The attributes section: `alt`, `href`, `placeholder`, `title` and their kin.
 *
 * Read off the same fresh parse the crumbs are, so a value that is not written
 * literally shows the expression named rather than disappearing. `src` on an
 * image is the import it is written as, never a URL.
 */
function Attributes({
	html,
	read,
	tag,
	assets,
	hidden,
	write,
	onSwap,
}: {
	html: string;
	read: RungRead;
	tag: string;
	assets: readonly ProjectAsset[];
	/** what the file says about this element being shown, which is the token itself */
	hidden: boolean;
	write: (act: "hide" | "show" | "attribute", attribute?: { name: string; value: string }) => void;
	onSwap: (put: { file: File } | { asset: string }) => void;
}) {
	const fields = useMemo(() => {
		const node = new DOMParser().parseFromString(html, "text/html").body.firstElementChild;
		const attributes = [...(read.attributes ?? [])];
		for (const attribute of node?.attributes ?? [])
			if (
				!attribute.name.startsWith("data-spool-") &&
				!["class", "style"].includes(attribute.name) &&
				!attributes.some((item) => item.name === attribute.name)
			)
				attributes.push({ name: attribute.name, value: attribute.value });
		return fieldsFor(tag, attributes, read.refusal);
	}, [tag, read.attributes, read.refusal, html]);
	// the element's own refusals — it is defined somewhere this frame does not
	// own, the stamp hits nothing, the file will not parse — are the ones that
	// stop a hide as well as a field
	const blocked = blocksFields(read.refusal);
	return (
		<Section name="attributes" {...(read.mapped === true ? { reason: "all rows" } : {})}>
			<Row name="hidden" ok={blocked === undefined}>
				<HiddenField hidden={hidden} ok={blocked === undefined} onToggle={() => write(hidden ? "show" : "hide")} />
				{blocked === undefined ? null : (
					<span className={cn("ml-auto min-w-0 shrink truncate pl-1", FAINT)}>{blocked}</span>
				)}
			</Row>
			{fields.map((field) => (
				<Row key={field.name} name={field.name} ok={field.reason === undefined}>
					{field.asset === true ? (
						<AssetField field={field} assets={assets} onSwap={onSwap} />
					) : (
						<TextField
							value={field.expression ?? field.value}
							ok={field.reason === undefined}
							placeholder="none"
							onCommit={(typed) => write("attribute", { name: field.name, value: typed })}
						/>
					)}
					{field.reason === undefined ? null : (
						<span className={cn("ml-auto min-w-0 shrink truncate pl-1", FAINT)}>{field.reason}</span>
					)}
				</Row>
			))}
		</Section>
	);
}

/**
 * Hide and show, as one word you press (#317).
 *
 * Not a checkbox: the row says what the element is right now, and pressing it
 * makes it the other thing. What lands in the file is the `hidden` token, and
 * what happens in the frame happens before the write leaves.
 */
function HiddenField({ hidden, ok, onToggle }: { hidden: boolean; ok: boolean; onToggle: () => void }) {
	if (!ok) {
		return (
			<span className={cn("flex min-w-0 flex-1 items-center px-1 text-muted", VALUE)}>
				{hidden ? "hidden" : "shown"}
			</span>
		);
	}
	return (
		<button
			type="button"
			data-hidden-toggle={hidden ? "hidden" : "shown"}
			onClick={onToggle}
			className={cn("flex min-w-0 flex-1 items-center px-1 text-left hover:text-text", BOX, VALUE)}
		>
			{hidden ? "hidden" : "shown"}
		</button>
	);
}

/** The picture, chosen — never typed, because the op has to write an import. */
function AssetField({
	field,
	assets,
	onSwap,
}: {
	field: AttributeField;
	assets: readonly ProjectAsset[];
	onSwap: (put: { file: File } | { asset: string }) => void;
}) {
	const picker = useRef<HTMLInputElement | null>(null);
	const held = field.specifier ?? "";
	const options: Option[] = [
		// the one row that is not a picture: the OS file dialog, which carries its
		// own act rather than a token the pick has to recognise
		{ kind: "action", name: "choose a file…", act: () => picker.current?.click() },
		...assets.map((asset) => ({
			token: asset.path,
			name: asset.path.split("/").at(-1) ?? asset.path,
			value: `${Math.ceil(asset.bytes / 1024)} KB`,
			group: asset.path.startsWith("shared/") ? "shared" : "beside the frame",
		})),
	];
	return (
		<>
			<Menu
				current={{
					token: held === "" ? null : held,
					name: held === "" ? "none" : (held.split("/").at(-1) ?? held),
				}}
				options={options}
				ok={field.reason === undefined}
				label="image"
				filter={assets.length > 8}
				onPick={(token) => {
					if (token === null) return;
					onSwap({ asset: token });
				}}
			/>
			{/* the OS dialog, which is the other half of choose-an-import: a browser
			    never reveals a dropped or chosen file's path, so the bytes are what
			    travels and the daemon decides where they land */}
			<input
				ref={picker}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file !== undefined) onSwap({ file });
				}}
			/>
		</>
	);
}

/**
 * The imports this frame may choose from, read once per frame.
 *
 * Asked for only where a rung actually has a picture on it, because most
 * elements do not and a menu nobody opens should cost no round trip. Re-read
 * on a reload, since a swap of its own puts a new file in the folder the menu
 * lists.
 */
function useAssets(project: string, frame: string | null, wanted: boolean, revision: number): ProjectAsset[] {
	const [assets, setAssets] = useState<ProjectAsset[]>([]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is not read in here, it is the trigger — a swap of its own puts a new file in the folder this lists
	useEffect(() => {
		if (frame === null || !wanted) {
			setAssets([]);
			return;
		}
		let live = true;
		void listAssets(project, frame).then((read) => {
			if (live) setAssets(read ?? []);
		});
		return () => {
			live = false;
		};
	}, [project, frame, wanted, revision]);
	return assets;
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
	spliced: "text-thread-strong",
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
	view,
}: {
	read: RungRead | undefined;
	scope: Scope;
	/** the tokens the file was written with; anything else is the hands' own */
	original: ReadonlySet<string>;
	view: View;
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
						<span className="text-muted">null</span>
					) : (
						tokens.map(({ token, at }, index) => {
							const ink = INK[tokenState(token, scope, original)];
							return (
								<span key={at}>
									{index > 0 ? " " : ""}
									<span className={ink}>{token}</span>
								</span>
							);
						})
					)}
				</p>
				<div className="flex items-center gap-2">
					<AddClassRow view={view} taken={new Set(tokens.map((held) => held.token))} />
					{where === undefined ? null : <span className={cn("min-w-0 truncate", FAINT)}>{where}</span>}
				</div>
			</div>
		</Section>
	);
}
