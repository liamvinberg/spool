import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	ELEMENTS,
	elementOf,
	FILE,
	literalVerdict,
	type Numeric,
	parse,
	sizeVerdict,
	type SourceElement,
	spacingVerdict,
	staticTokens,
	textVerdict,
	withToken,
	withWord,
	type Word,
	WORDS,
} from "shared/lib/spool/properties-model";
import { cn } from "shared/lib/utils";
import { PropertiesCart } from "shared/ui/demo/kaffe-properties-cart";
import {
	byGroup,
	CANDIDATES,
	type Candidate,
	chipOf,
	type Chip,
	chipsOf,
	type Group,
	type Option,
	type Picker,
	PICKERS,
	readable,
	step,
	withNamed,
	withoutToken,
} from "./literal-tokens";

/**
 * panel--literal: the className literal is the panel.
 *
 * The raw is the spine. Every token the element wears is a row, in the order
 * the file wrote it, gathered into its Tailwind family and the families in CSS
 * order. The token is the label, so `items-center` is called `items-center`
 * and the CSS it means sits faint at the right of the row. Three primitives
 * and no others: a number steps with the arrows and commits on Enter, a word
 * swaps through a menu on the chip, a named token comes off a menu of the
 * project's tokens with its value beside it. The `+` at the foot adds a family
 * that is absent, by typing the token or picking it.
 *
 * What it should feel like: reading source with your hands on it. Pick `pay`
 * and `bg-thread` is one click from `bg-surface`; step `h-11` and the button
 * grows under the pointer and the row reads `48px`; the tokens you moved stay
 * red. Pick `back` or a `price` and the panel does not pretend, it shows the
 * expression or names the file the class lives in.
 */

const STAGE = { w: 300, h: 620 };
const WHERE = FILE.split("/").slice(-2).join("/");

interface Box {
	id: string;
	key: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Anchor {
	left: number;
	top: number;
	width: number;
}

type Menu =
	| { kind: "pick"; at: Anchor; options: readonly Option[]; current: string | null; apply: (token: string | null) => void }
	| { kind: "add"; at: Anchor; apply: (candidate: Candidate) => void; refused: (candidate: Candidate) => string | null };

export default function PanelLiteralFrame() {
	const [classes, setClasses] = useState<Record<string, string>>(() =>
		Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	);
	const [texts, setTexts] = useState<Record<string, string>>({});
	const [frame, setFrame] = useState({ x: 1740, y: 96, w: STAGE.w, h: STAGE.h });
	const [sel, setSel] = useState("pay");
	const [hover, setHover] = useState<string | null>(null);
	const [menu, setMenu] = useState<Menu | null>(null);
	const [added, setAdded] = useState<string | null>(null);
	const [boxes, setBoxes] = useState<readonly Box[]>([]);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);

	const measure = useCallback(() => {
		const stage = stageRef.current;
		if (stage === null) return;
		const origin = stage.getBoundingClientRect();
		const next: Box[] = [];
		for (const node of stage.querySelectorAll<HTMLElement>("[data-node]")) {
			const rect = node.getBoundingClientRect();
			next.push({
				id: node.dataset.node ?? "",
				key: node.dataset.key ?? "",
				x: rect.left - origin.left,
				y: rect.top - origin.top,
				w: rect.width,
				h: rect.height,
			});
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(() => {
		measure();
	}, [measure, classes, texts, frame]);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenu(null);
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, []);

	const element = elementOf(sel) ?? null;
	const openMenu = (event: React.PointerEvent | React.MouseEvent, next: (at: Anchor) => Menu, height: number, width: number) => {
		const root = rootRef.current;
		if (root === null) return;
		const origin = root.getBoundingClientRect();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const below = rect.bottom - origin.top + 4;
		const up = below + height > origin.height - 12;
		setMenu(
			next({
				left: Math.max(8, Math.min(rect.left - origin.left, origin.width - width - 8)),
				top: up ? Math.max(8, rect.top - origin.top - height - 4) : below,
				width,
			}),
		);
	};

	const pick = (target: EventTarget | null): string | null => {
		let node = target instanceof Element ? target : null;
		while (node !== null && stageRef.current?.contains(node) === true) {
			const id = node.getAttribute("data-node");
			if (id !== null) return id;
			node = node.parentElement;
		}
		return null;
	};

	const selectedBoxes = boxes.filter((box) => box.id === sel);
	const hoverBoxes = hover === null || hover === sel ? [] : boxes.filter((box) => box.id === hover);
	const measured = selectedBoxes[0] ?? null;

	return (
		<div ref={rootRef} className="relative flex h-full w-full overflow-hidden bg-canvas text-text">
			<div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
				<div className="flex min-h-0 flex-1 items-start justify-center overflow-hidden">
					<div
						ref={stageRef}
						className="relative shrink-0"
						style={{ width: frame.w, height: frame.h, outline: "1px solid var(--color-border)" }}
						onPointerDown={(event) => {
							const id = pick(event.target);
							if (id !== null) setSel(id);
						}}
						onPointerMove={(event) => setHover(pick(event.target))}
						onPointerLeave={() => setHover(null)}
					>
						<PropertiesCart classes={classes} texts={texts} elements={ELEMENTS} />
						<div className="pointer-events-none absolute inset-0">
							{hoverBoxes.map((box) => (
								<Ring key={`h-${box.id}-${box.key}`} box={box} color="var(--color-border-raised)" />
							))}
							{selectedBoxes.map((box) => (
								<Ring key={`s-${box.id}-${box.key}`} box={box} color="var(--color-thread)" />
							))}
						</div>
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap gap-1">
					{ELEMENTS.map((candidate) => (
						<button
							key={candidate.id}
							type="button"
							onClick={() => setSel(candidate.id)}
							onPointerEnter={() => setHover(candidate.id)}
							onPointerLeave={() => setHover(null)}
							className={cn(
								"h-5 cursor-pointer rounded-xs border px-1.5 font-mono text-2xs leading-3",
								candidate.id === sel ? "border-thread text-thread" : "border-border text-muted/70 hover:text-text",
							)}
						>
							{candidate.id === "screen" ? "cart" : candidate.id}
						</button>
					))}
				</div>
			</div>

			<Panel
				element={element}
				className={element === null ? "" : (classes[element.id] ?? "")}
				text={element === null ? null : (texts[element.id] ?? null)}
				frame={frame}
				measured={measured}
				added={added}
				onSelect={setSel}
				onOpen={openMenu}
				onFrame={(patch) => setFrame((current) => ({ ...current, ...patch }))}
				onClass={(id, next) => setClasses((current) => ({ ...current, [id]: next(current[id] ?? "") }))}
				onText={(id, value) => setTexts((current) => ({ ...current, [id]: value }))}
				onAdded={setAdded}
			/>

			{menu === null ? null : (
				<>
					<div className="absolute inset-0 z-30" onPointerDown={() => setMenu(null)} />
					{menu.kind === "pick" ? (
						<PickMenu
							menu={menu}
							onPick={(token) => {
								menu.apply(token);
								setMenu(null);
							}}
						/>
					) : (
						<AddMenu
							menu={menu}
							onPick={(candidate) => {
								menu.apply(candidate);
								setMenu(null);
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}

function Ring({ box, color }: { box: Box; color: string }) {
	return (
		<span
			className="absolute"
			style={{ left: box.x - 1, top: box.y - 1, width: box.w + 2, height: box.h + 2, border: `1px solid ${color}` }}
		/>
	);
}

/* ---------- the panel ---------- */

interface PanelProps {
	element: SourceElement | null;
	className: string;
	text: string | null;
	frame: { x: number; y: number; w: number; h: number };
	measured: Box | null;
	added: string | null;
	onSelect: (id: string) => void;
	onOpen: (event: React.MouseEvent, next: (at: Anchor) => Menu, height: number, width: number) => void;
	onFrame: (patch: Partial<{ x: number; y: number; w: number; h: number }>) => void;
	onClass: (id: string, next: (className: string) => string) => void;
	onText: (id: string, value: string) => void;
	onAdded: (token: string | null) => void;
}

function Panel({ element, className, text, frame, measured, added, onSelect, onOpen, onFrame, onClass, onText, onAdded }: PanelProps) {
	if (element === null) return <aside className="h-full w-[300px] shrink-0 border-border border-l bg-bg" />;

	const isRoot = element.id === "screen";
	const literal = literalVerdict(element);
	const writable = literal.ok;
	const original = new Set((element.className ?? "").split(/\s+/).filter(Boolean));
	const chips: Chip[] = element.computed === undefined ? chipsOf(className) : staticTokens(element, className).map((token) => chipOf(token));
	const groups = byGroup(chips);
	const inline = element.display === "inline";
	const spacing = spacingVerdict(element);
	const size = sizeVerdict(element, "w");
	const present = new Set(chips.map((chip) => chip.token));

	const refusalOf = (group: Group): string | null => {
		if (!literal.ok) return null;
		if (group === "sizing" && !size.ok) return size.reason;
		if (group === "spacing" && !spacing.ok) return spacing.reason;
		return null;
	};

	const rows = groups.map(({ group, chips: held }) => (
		<Section key={group} title={group} reason={refusalOf(group)}>
			{held.map((chip) => (
				<Row
					key={`${chip.group}:${chip.family}`}
					chip={chip}
					ok={writable && refusalOf(chip.group) === null}
					changed={!original.has(chip.token)}
					opened={added === chip.token}
					measured={chip.family === "w" ? (measured?.w ?? null) : chip.family === "h" ? (measured?.h ?? null) : null}
					onOpen={onOpen}
					onWrite={(next) => onClass(element.id, next)}
				/>
			))}
		</Section>
	));

	return (
		<aside className="flex h-full w-[300px] shrink-0 flex-col border-border border-l bg-bg">
			<div className="flex shrink-0 flex-col gap-1 border-border border-b px-3 py-2.5">
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-base leading-base">{element.name}</span>
					<span className="font-mono text-2xs text-muted leading-3">{element.tag}</span>
					{literal.ok && literal.scope !== undefined ? (
						<span className="font-mono text-2xs text-muted/55 leading-3">{literal.scope}</span>
					) : null}
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/55 leading-3">
						{WHERE}:{element.line}
					</span>
				</div>
				<div className="flex min-w-0 items-center gap-1 overflow-hidden">
					{chainOf(element.id).map((crumb, index) => (
						<span key={crumb.id} className="flex shrink-0 items-center gap-1">
							{index === 0 ? null : <span className="font-mono text-2xs text-muted/35 leading-3">/</span>}
							<button
								type="button"
								onClick={() => onSelect(crumb.id)}
								className={cn(
									"cursor-pointer font-mono text-2xs leading-3",
									crumb.id === element.id ? "text-muted" : "text-muted/45 hover:text-muted",
								)}
							>
								{crumb.name}
							</button>
						</span>
					))}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{isRoot ? (
					<Section title="frame.json">
						<div className="flex gap-1.5">
							<FrameField label="x" value={frame.x} onCommit={(value) => onFrame({ x: value })} />
							<FrameField label="y" value={frame.y} onCommit={(value) => onFrame({ y: value })} />
						</div>
						<div className="flex gap-1.5">
							<FrameField label="w" value={frame.w} min={80} onCommit={(value) => onFrame({ w: value })} />
							<FrameField label="h" value={frame.h} min={80} onCommit={(value) => onFrame({ h: value })} />
						</div>
					</Section>
				) : null}

				{element.text === undefined ? null : (
					<TextRow element={element} text={text} onText={(value) => onText(element.id, value)} />
				)}

				{element.computed === undefined && element.className !== null ? null : (
					<Section title="className">
						<p className={cn("font-mono text-sm leading-sm", element.computed === undefined ? "text-muted/45" : "text-muted/60")}>
							{element.computed ?? "none"}
						</p>
						{literal.ok ? null : <p className="pt-0.5 font-mono text-2xs text-muted/50 leading-4">{literal.reason}</p>}
					</Section>
				)}

				{rows}

				{writable && inline && !groups.some((row) => row.group === "sizing") ? (
					<Section title="sizing" reason={size.ok ? null : size.reason} />
				) : null}

				{writable ? (
					<div className="px-3 py-2.5">
						<button
							type="button"
							onClick={(event) =>
								onOpen(
									event,
									(at) => ({
										kind: "add",
										at,
										apply: (candidate) => {
											onClass(element.id, (current) => `${current} ${candidate.token}`.trim());
											onAdded(candidate.edit ? candidate.token : null);
										},
										refused: (candidate) => {
											if (candidate.group === "sizing" && !size.ok) return size.reason;
											if (candidate.group === "spacing" && !spacing.ok) return spacing.reason;
											return present.has(candidate.token) ? "on the literal" : null;
										},
									}),
									255,
									264,
								)
							}
							className="flex h-[22px] cursor-pointer items-center rounded-xs px-1 font-mono text-muted/50 text-sm leading-sm hover:bg-raised hover:text-text"
						>
							+
						</button>
					</div>
				) : null}
			</div>
		</aside>
	);
}

function Section({ title, reason, children }: { title: string; reason?: string | null; children?: ReactNode }) {
	return (
		<section className="flex flex-col gap-1 border-border border-b px-3 py-2.5">
			<div className="flex min-w-0 items-baseline gap-2">
				<span className="shrink-0 font-mono text-2xs text-muted leading-3">{title}</span>
				{reason === undefined || reason === null ? null : (
					<span className="ml-auto min-w-0 truncate font-mono text-2xs text-muted/50 leading-3">{reason}</span>
				)}
			</div>
			{children}
		</section>
	);
}

/* ---------- one token, one row ---------- */

interface RowProps {
	chip: Chip;
	ok: boolean;
	changed: boolean;
	opened: boolean;
	measured: number | null;
	onOpen: PanelProps["onOpen"];
	onWrite: (next: (className: string) => string) => void;
}

function Row({ chip, ok, changed, opened, measured, onOpen, onWrite }: RowProps) {
	return (
		<div className="group flex h-[22px] items-center gap-2">
			{chip.kind === "number" ? (
				<NumberChip chip={chip} ok={ok} changed={changed} opened={opened} measured={measured} onWrite={onWrite} />
			) : chip.kind === "word" ? (
				<MenuChip
					chip={chip}
					ok={ok}
					changed={changed}
					onOpen={(event) =>
						onOpen(
							event,
							(at) => ({
								kind: "pick",
								at,
								current: chip.token,
								options: WORDS[chip.family as Word].options.map((option) => ({
									token: option.token,
									css: chipsOf(option.token)[0]?.css ?? "",
									swatch: null,
								})),
								apply: (token) => onWrite((current) => withWord(current, chip.family as Word, token)),
							}),
							WORDS[chip.family as Word].options.length * 22 + 30,
							210,
						)
					}
				/>
			) : chip.kind === "named" ? (
				<MenuChip
					chip={chip}
					ok={ok}
					changed={changed}
					onOpen={(event) =>
						onOpen(
							event,
							(at) => ({
								kind: "pick",
								at,
								current: chip.token,
								options: PICKERS[chip.family as Picker],
								apply: (token) => onWrite((current) => withNamed(current, chip.family as Picker, token)),
							}),
							Math.min(PICKERS[chip.family as Picker].length * 22 + 30, 255),
							210,
						)
					}
				/>
			) : (
				<span className={cn("flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-xs px-1 font-mono text-sm leading-sm", tone(ok, changed))}>
					{chip.token}
				</span>
			)}
			<span className="ml-auto min-w-0 truncate font-mono text-2xs text-muted/50 leading-3">{chip.css}</span>
			<button
				type="button"
				aria-label={`remove ${chip.token}`}
				disabled={!ok}
				onClick={() => onWrite((current) => withoutToken(current, chip.token))}
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] font-mono text-2xs leading-3",
					ok ? "cursor-pointer text-muted/0 group-hover:text-muted/60 hover:bg-raised hover:text-text" : "text-muted/0",
				)}
			>
				×
			</button>
		</div>
	);
}

function tone(ok: boolean, changed: boolean): string {
	if (!ok) return "text-muted/45";
	return changed ? "text-thread" : "text-text";
}

/** a length, a count, a percentage: the value half is the field, the arrows step it */
function NumberChip({
	chip,
	ok,
	changed,
	opened,
	measured,
	onWrite,
}: {
	chip: Chip;
	ok: boolean;
	changed: boolean;
	opened: boolean;
	measured: number | null;
	onWrite: (next: (className: string) => string) => void;
}) {
	const [editing, setEditing] = useState(opened && ok);
	const write = (value: string) => onWrite((current) => withToken(current, chip.family as Numeric, value));

	return (
		<span className={cn("flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-xs font-mono text-sm leading-sm", tone(ok, changed))}>
			<span className="pl-1">{chip.family}-</span>
			{editing ? (
				<Field
					value={chip.value}
					onStep={(direction, big) => {
						const next = step(chip.family, chip.value, measured, direction, big);
						write(next);
						return next;
					}}
					onCommit={(typed) => {
						const value = parse(typed);
						if (value !== null) write(value);
						setEditing(false);
					}}
					onCancel={() => setEditing(false)}
				/>
			) : (
				<button
					type="button"
					disabled={!ok}
					onClick={() => setEditing(true)}
					className={cn("h-[22px] rounded-xs pr-1 pl-px", ok ? "cursor-text hover:bg-raised" : "cursor-default")}
				>
					{chip.value}
				</button>
			)}
		</span>
	);
}

/** the value half, open: Enter commits, Esc reverts, the arrows step and shift steps ten */
function Field({
	value,
	onStep,
	onCommit,
	onCancel,
}: {
	value: string;
	onStep: (direction: 1 | -1, big: boolean) => string;
	onCommit: (typed: string) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.select();
	}, []);
	return (
		<input
			ref={inputRef}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={onCancel}
			onKeyDown={(event) => {
				if (event.key === "Enter") onCommit(draft);
				if (event.key === "Escape") onCancel();
				if (event.key === "ArrowUp" || event.key === "ArrowDown") {
					event.preventDefault();
					setDraft(onStep(event.key === "ArrowUp" ? 1 : -1, event.shiftKey));
				}
			}}
			style={{ width: `${Math.max(2, draft.length + 1)}ch` }}
			className="h-[22px] rounded-xs bg-raised pr-1 pl-px text-text caret-thread outline-none"
		/>
	);
}

/** a word or a named token: the whole chip is the menu */
function MenuChip({ chip, ok, changed, onOpen }: { chip: Chip; ok: boolean; changed: boolean; onOpen: (event: React.MouseEvent) => void }) {
	return (
		<button
			type="button"
			disabled={!ok}
			onClick={onOpen}
			className={cn(
				"flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xs px-1 font-mono text-sm leading-sm",
				tone(ok, changed),
				ok ? "cursor-pointer hover:bg-raised" : "cursor-default",
			)}
		>
			{chip.swatch === null ? null : (
				<span className="h-2.5 w-2.5 shrink-0 rounded-[2px] border border-border-raised" style={{ background: chip.swatch }} />
			)}
			{chip.token}
			{ok ? <Caret /> : null}
		</button>
	);
}

function Caret() {
	return (
		<svg viewBox="0 0 8 8" className="h-2 w-2 shrink-0 text-muted/40" fill="none" aria-hidden="true">
			<path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

/* ---------- the frame root's own four numbers ---------- */

function FrameField({ label, value, min = 0, onCommit }: { label: string; value: number; min?: number; onCommit: (value: number) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<label className="flex h-[22px] min-w-0 flex-1 items-center gap-1 rounded-xs border border-border bg-surface px-1.5 font-mono text-sm leading-sm">
			<span className="shrink-0 text-2xs text-muted/55 leading-3">{label}</span>
			<input
				value={draft ?? String(value)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => setDraft(null)}
				onKeyDown={(event) => {
					const commit = (next: number) => {
						if (!Number.isNaN(next)) onCommit(Math.max(min, Math.round(next)));
					};
					if (event.key === "Enter") {
						commit(Number.parseFloat(draft ?? String(value)));
						setDraft(null);
					}
					if (event.key === "Escape") setDraft(null);
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						const base = Number.parseFloat(draft ?? String(value));
						const next = (Number.isNaN(base) ? value : base) + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
						setDraft(null);
						commit(next);
					}
				}}
				className="min-w-0 flex-1 bg-transparent text-text caret-thread outline-none"
			/>
		</label>
	);
}

/* ---------- the text a tag holds ---------- */

function TextRow({ element, text, onText }: { element: SourceElement; text: string | null; onText: (value: string) => void }) {
	const verdict = textVerdict(element);
	const literal = element.text !== undefined && "literal" in element.text ? element.text.literal : null;
	const shown = text ?? literal;
	const [draft, setDraft] = useState<string | null>(null);
	if (!verdict.ok || shown === null) {
		const expr = element.text !== undefined && "expr" in element.text ? element.text.expr : "";
		return (
			<div className="flex items-center gap-2 border-border border-b px-3 py-2">
				<span className="font-mono text-muted/60 text-sm leading-sm">{expr}</span>
				<span className="ml-auto min-w-0 truncate font-mono text-2xs text-muted/50 leading-3">
					{verdict.ok ? "" : (verdict.reason.split(", {")[0] ?? "")}
				</span>
			</div>
		);
	}
	return (
		<div className="flex items-center border-border border-b px-3 py-2 font-mono text-sm leading-sm">
			<span className="text-muted/50">"</span>
			<input
				value={draft ?? shown}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => setDraft(null)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						if (draft !== null) onText(draft);
						setDraft(null);
					}
					if (event.key === "Escape") setDraft(null);
				}}
				style={{ width: `${Math.max(1, (draft ?? shown).length) + 0.5}ch` }}
				className="min-w-0 bg-transparent text-text caret-thread outline-none"
			/>
			<span className="text-muted/50">"</span>
			{verdict.scope === undefined ? null : <span className="ml-auto shrink-0 text-2xs text-muted/50 leading-3">{verdict.scope}</span>}
		</div>
	);
}

/* ---------- menus ---------- */

function Shell({ at, children }: { at: Anchor; children: ReactNode }) {
	return (
		<div
			className="absolute z-40 max-h-[255px] overflow-y-auto rounded-sm border border-border-raised bg-raised py-1"
			style={{ left: at.left, top: at.top, width: at.width }}
		>
			{children}
		</div>
	);
}

function PickMenu({ menu, onPick }: { menu: Extract<Menu, { kind: "pick" }>; onPick: (token: string | null) => void }) {
	return (
		<Shell at={menu.at}>
			{menu.options.map((option) => (
				<button
					key={option.token}
					type="button"
					onClick={() => onPick(option.token)}
					className={cn(
						"flex h-[22px] w-full cursor-pointer items-center gap-2 px-2 font-mono text-sm leading-sm hover:bg-border-raised",
						option.token === menu.current ? "text-thread" : "text-text",
					)}
				>
					{option.swatch === null ? null : (
						<span className="h-2.5 w-2.5 shrink-0 rounded-[2px] border border-border-raised" style={{ background: option.swatch }} />
					)}
					<span className="truncate">{option.token}</span>
					<span className="ml-auto shrink-0 text-2xs text-muted/60 leading-3">{option.css}</span>
				</button>
			))}
			<button
				type="button"
				onClick={() => onPick(null)}
				className="flex h-[22px] w-full cursor-pointer items-center px-2 font-mono text-2xs text-muted/60 leading-3 hover:bg-border-raised hover:text-text"
			>
				remove
			</button>
		</Shell>
	);
}

function AddMenu({ menu, onPick }: { menu: Extract<Menu, { kind: "add" }>; onPick: (candidate: Candidate) => void }) {
	const [typed, setTyped] = useState("");
	const [at, setAt] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const matches = CANDIDATES.filter((candidate) => candidate.token.includes(typed));
	const raw = typed !== "" && readable(typed) && !matches.some((candidate) => candidate.token === typed);
	const list = raw ? [{ token: typed, group: "layout" as Group, css: "", swatch: null, edit: false }, ...matches] : matches;
	const index = Math.min(at, Math.max(0, list.length - 1));

	return (
		<Shell at={menu.at}>
			<div className="flex h-[22px] items-center gap-1 px-2 font-mono text-sm leading-sm">
				<span className="text-muted/50">+</span>
				<input
					ref={inputRef}
					value={typed}
					onChange={(event) => {
						setTyped(event.target.value.trim());
						setAt(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setAt(Math.min(index + 1, list.length - 1));
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setAt(Math.max(index - 1, 0));
						}
						if (event.key === "Enter") {
							const chosen = list[index];
							if (chosen !== undefined && menu.refused(chosen) === null) onPick(chosen);
						}
					}}
					className="min-w-0 flex-1 bg-transparent text-text caret-thread outline-none"
				/>
			</div>
			<div className="mt-1 border-border-raised border-t pt-1">
				{list.map((candidate, position) => {
					const refused = menu.refused(candidate);
					return (
						<button
							key={candidate.token}
							type="button"
							disabled={refused !== null}
							onPointerEnter={() => setAt(position)}
							onClick={() => onPick(candidate)}
							className={cn(
								"flex h-[22px] w-full items-center gap-2 px-2 font-mono text-sm leading-sm",
								refused === null ? "cursor-pointer text-text" : "cursor-default text-muted/45",
								position === index && refused === null ? "bg-border-raised" : "",
							)}
						>
							{candidate.swatch === null ? null : (
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-[2px] border border-border-raised"
									style={{ background: candidate.swatch }}
								/>
							)}
							<span className="truncate">{candidate.token}</span>
							<span className="ml-auto shrink-0 text-2xs text-muted/55 leading-3">{refused ?? candidate.group}</span>
						</button>
					);
				})}
			</div>
		</Shell>
	);
}
