import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { KnobValue } from "../../runtime/knob-protocol";
import { cn } from "../cn";
import { ChevronIcon, LinkIcon } from "../icons";
import { Button } from "../primitives/actions";
import { Popover } from "../primitives/overlays";
import { Section, StatusLine } from "../primitives/structure";
import { Choices, KnobEditor, KnobInRow, KnobPreview } from "./knob-controls";
import { fileOf, headsOver, type KnobLine, knobLines, nudged, reachOf, scrubs, statusWords, valueNow } from "./knobs";
import { scrubStep, useCloseOnPressAway } from "./rail-fields";
import { type FrameKnobs, type KnobLane, useFrameKnobs } from "./use-knobs";

/**
 * The Knobs section of the properties rail (#220): a frame's knobs under its
 * geometry, one calm row each. A press opens a row in place into its editor
 * and shuts the one before, the pressed row holding its place; a list too
 * long for the rail opens beside its row instead; a knob whose control fits
 * its row acts there and never opens. A row that is one number at heart
 * scrubs where it stands. The keyboard walks rows and group heads, and Escape
 * backs out one level. One line at the foot says what letting go will write,
 * then where it was written.
 */

export interface KnobsActs {
	lane: KnobLane;
	/** what Save as variant would call the copy */
	variantOf: (frame: string) => string;
	onSaveVariant: (frame: string) => void;
}

type Knob = Extract<KnobLine, { kind: "knob" }>;

export function KnobsSection({ frame, acts }: { frame: string; acts: KnobsActs }) {
	const knobs = useFrameKnobs(acts.lane, frame);
	if (knobs.calls.length === 0) return null;
	return <Knobs key={frame} frame={frame} knobs={knobs} acts={acts} />;
}

function Knobs({ frame, knobs, acts }: { frame: string; knobs: FrameKnobs; acts: KnobsActs }) {
	const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
	const [open, setOpen] = useState<string | null>(null);
	const section = useRef<HTMLDivElement | null>(null);
	/** the row pressed open, and where it stood, so the editor shutting above it cannot move it */
	const anchor = useRef<{ id: string; top: number } | null>(null);
	const lines = knobLines(frame, knobs.calls, folded);
	const count = lines.filter((line) => line.kind === "knob").length;

	const rowOf = useCallback(
		(id: string) =>
			[...(section.current?.querySelectorAll<HTMLElement>("[data-knob-id]") ?? [])].find(
				(row) => row.dataset.knobId === id,
			),
		[],
	);
	const openRow = useCallback(
		(id: string | null) => {
			const row = id === null ? undefined : rowOf(id);
			anchor.current = id === null || row === undefined ? null : { id, top: row.getBoundingClientRect().top };
			setOpen(id);
		},
		[rowOf],
	);
	useLayoutEffect(() => {
		const held = anchor.current;
		anchor.current = null;
		if (held === null || open !== held.id) return;
		const row = rowOf(held.id);
		const scroller = row?.closest<HTMLElement>("[data-properties-scroll]");
		if (row === undefined || scroller === null || scroller === undefined) return;
		scroller.scrollTop += row.getBoundingClientRect().top - held.top;
		// an editor opening low glides the rail just far enough to show it
		row.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [open, rowOf]);

	// an undo lands where it can be seen: the groups over its row unfold and the row comes into view
	const washed = knobs.washed;
	useEffect(() => {
		if (washed === null) return;
		setFolded((was) => {
			const over = headsOver(washed.at, washed.path);
			return over.some((id) => was.has(id)) ? new Set([...was].filter((id) => !over.includes(id))) : was;
		});
		const timer = setTimeout(() => rowOf(washed.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
		return () => clearTimeout(timer);
	}, [washed, rowOf]);

	const fold = (id: string) => {
		const next = new Set(folded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setFolded(next);
		// the open row goes with its group
		if (open?.startsWith(`${id}.`)) setOpen(null);
	};

	return (
		<div ref={section} data-knobs-section="" className="contents">
			<Section title="knobs" meta={fileOf(frame, knobs.calls[0]?.at ?? "")}>
				{lines.map((line) =>
					line.kind === "group" ? (
						<GroupHead key={line.id} line={line} onFold={() => fold(line.id)} />
					) : (
						<KnobRow
							key={line.id}
							frame={frame}
							knob={line}
							knobs={knobs}
							lane={acts.lane}
							open={open === line.id}
							onOpen={(on) => openRow(on ? line.id : null)}
						/>
					),
				)}
				<Foot knobs={knobs} count={count} />
				<div className="flex items-center gap-3 px-3 pb-2.5">
					<Button variant="secondary" size="sm" className="flex-1" onClick={() => acts.onSaveVariant(frame)}>
						Save as variant
					</Button>
					<span className="shrink-0 truncate text-tertiary type-detail">{acts.variantOf(frame)}</span>
				</div>
			</Section>
		</div>
	);
}

/* ---------- walking it by keyboard ---------- */

/** ↑ and ↓ to the row or group head before or after: what every head in the section shares. */
function walk(event: ReactKeyboardEvent<HTMLElement>): boolean {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
	event.preventDefault();
	event.stopPropagation();
	const heads = [
		...(event.currentTarget.closest("[data-knobs-section]")?.querySelectorAll<HTMLElement>("[data-knob-head]") ?? []),
	];
	const at = heads.indexOf(event.currentTarget);
	heads[Math.min(heads.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
	return true;
}

/* ---------- a group ---------- */

function GroupHead({ line, onFold }: { line: Extract<KnobLine, { kind: "group" }>; onFold: () => void }) {
	return (
		<button
			type="button"
			data-knob-head=""
			data-knob-group={line.key}
			aria-expanded={line.open}
			onClick={onFold}
			onKeyDown={(event) => {
				if (walk(event)) return;
				if ((event.key === "ArrowLeft" && line.open) || (event.key === "ArrowRight" && !line.open)) {
					event.preventDefault();
					event.stopPropagation();
					onFold();
				} else if (event.key === "Enter" || event.key === " ") event.stopPropagation();
			}}
			style={{ paddingLeft: `calc(var(--spacing) * ${3 + line.depth * 3})` }}
			className="group/fold flex h-row w-full cursor-pointer items-center gap-1.5 border-line-subtle border-b pr-3 text-left text-primary outline-none transition-colors duration-fast hover:bg-state-hover focus-ring-inset"
		>
			<span
				className={cn(
					"flex size-3 shrink-0 text-tertiary transition-transform duration-fast group-hover/fold:text-secondary [&>svg]:size-full",
					line.open && "rotate-90",
				)}
			>
				<ChevronIcon />
			</span>
			<span className="type-value">{line.key}</span>
			{line.open ? null : (
				<span className="ml-auto flex items-center gap-2 text-tertiary type-detail">
					{line.shared ? <SharedMark /> : null}
					{line.count}
				</span>
			)}
		</button>
	);
}

function SharedMark() {
	return (
		<span className="flex size-3 shrink-0 [&>svg]:size-full">
			<LinkIcon />
		</span>
	);
}

/* ---------- a knob ---------- */

function KnobRow({
	frame,
	knob,
	knobs,
	lane,
	open,
	onOpen,
}: {
	frame: string;
	knob: Knob;
	knobs: FrameKnobs;
	lane: KnobLane;
	open: boolean;
	onOpen: (open: boolean) => void;
}) {
	const { spec, computed } = knob;
	const self = useRef<HTMLDivElement | null>(null);
	const head = useRef<HTMLDivElement | null>(null);
	const value = valueNow(spec, knobs.live.get(knob.at)?.[knob.path]);
	const reach = reachOf(spec.type);
	const tune = (next: KnobValue, phase: "live" | "commit" | "cancel") => lane.tune(frame, knob, next, phase);
	/** what ←/→ held has stepped to, written when the key lets go */
	const stepping = useRef<KnobValue | null>(null);
	const [scrubbing, setScrubbing] = useState(false);

	const close = () => {
		onOpen(false);
		head.current?.focus({ preventScroll: true });
	};

	/** what a press or Return on the row does: an action runs, a switch flips, words take the caret, the rest opens */
	const act = () => {
		if (computed) return;
		if (spec.type === "action") lane.press(knob);
		else if (spec.type === "toggle") tune(value !== true, "commit");
		else if (reach === "row") self.current?.querySelector<HTMLElement>("input")?.focus();
		else onOpen(!open);
	};

	const press = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || computed) return;
		// a press on the row's own control is that control's
		if ((event.target as HTMLElement).closest("input, button, label, textarea, [role=radiogroup]") !== null) return;
		event.preventDefault();
		head.current?.focus({ preventScroll: true });
		const target = event.currentTarget;
		const pointer = event.pointerId;
		const from = value;
		let carry = 0;
		let units = 0;
		let x = event.clientX;
		let moved = false;
		let done = false;
		const end = () => {
			done = true;
			target.removeEventListener("pointermove", move);
			target.removeEventListener("pointerup", up);
			target.removeEventListener("pointercancel", cancel);
			window.removeEventListener("keydown", key, true);
			if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
			setScrubbing(false);
		};
		const move = (next: PointerEvent) => {
			if (done || !scrubs(spec)) return;
			// movement first, as the geometry's scrub reads it; a browser that reports none leaves the position
			const step = scrubStep(carry, next.movementX || next.clientX - x, next.shiftKey);
			x = next.clientX;
			carry = step.carry;
			if (step.units === 0) return;
			units += step.units;
			const to = nudged(spec, from, units);
			if (to === undefined) return;
			if (!moved) setScrubbing(true);
			moved = true;
			tune(to, "live");
		};
		const up = () => {
			end();
			if (!moved) act();
			else {
				const to = nudged(spec, from, units);
				if (to !== undefined) tune(to, "commit");
			}
		};
		const cancel = () => {
			end();
			if (moved && from !== undefined) tune(from, "cancel");
		};
		// Escape mid-scrub puts back the value from before it and writes nothing
		const key = (next: KeyboardEvent) => {
			if (next.key !== "Escape") return;
			next.preventDefault();
			next.stopPropagation();
			cancel();
		};
		target.setPointerCapture(pointer);
		target.addEventListener("pointermove", move);
		target.addEventListener("pointerup", up);
		target.addEventListener("pointercancel", cancel);
		window.addEventListener("keydown", key, true);
	};

	const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget || walk(event)) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			event.stopPropagation();
			if (open) close();
			else act();
		} else if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !computed) {
			event.preventDefault();
			event.stopPropagation();
			const units = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1);
			const to = nudged(spec, stepping.current ?? value, units);
			if (to === undefined) return;
			// a number held is one gesture and one write; a choice or a switch is written at once
			if (scrubs(spec)) {
				stepping.current = to;
				tune(to, "live");
			} else tune(to, "commit");
		}
	};
	const keyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || stepping.current === null) return;
		tune(stepping.current, "commit");
		stepping.current = null;
	};

	const refused = knobs.refused?.id === knob.id ? knobs.refused.refusal : null;
	const washed = knobs.washed?.id === knob.id ? knobs.washed.n : 0;
	const control = { spec, value: value as KnobValue, onTune: tune, label: knob.key, disabled: computed };
	return (
		<div
			ref={self}
			data-knob-id={knob.id}
			data-knob={knob.path}
			className={cn("relative border-line-subtle border-b", open && reach === "opens" && "bg-surface-panel")}
		>
			{washed === 0 ? null : (
				<span
					key={washed}
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 animate-history-wash"
				/>
			)}
			{/* biome-ignore lint/a11y/useSemanticElements: a row holds controls of its own, so it cannot be a button */}
			<div
				ref={head}
				data-knob-head=""
				role="button"
				tabIndex={0}
				aria-expanded={reach === "row" ? undefined : open}
				aria-label={knob.key}
				onPointerDown={press}
				onKeyDown={keyDown}
				onKeyUp={keyUp}
				style={{ paddingLeft: `calc(var(--spacing) * ${3 + knob.depth * 3})` }}
				className={cn(
					"group/knob relative grid h-row min-w-0 select-none grid-cols-[calc(var(--spacing)*22)_minmax(0,1fr)_12px] items-center gap-2 pr-3 outline-none transition-colors duration-fast focus-ring-inset",
					computed ? "cursor-default" : scrubs(spec) && !open ? "cursor-ew-resize" : "cursor-pointer",
					!open && "hover:bg-state-hover",
				)}
			>
				<span className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							"truncate transition-colors duration-fast type-detail",
							open || scrubbing ? "text-primary" : "text-secondary group-hover/knob:text-primary",
						)}
					>
						{knob.key}
					</span>
					{knob.shared === null ? null : (
						<span
							title={`Declared in ${knob.shared}: one value for every frame that renders it`}
							className="text-tertiary"
						>
							<SharedMark />
						</span>
					)}
				</span>
				<span className="flex min-w-0 items-center">
					{reach === "row" && !computed ? (
						<KnobInRow {...control} onPress={() => lane.press(knob)} />
					) : (
						<KnobPreview spec={spec} value={value} />
					)}
				</span>
				<span className="flex justify-end text-tertiary type-detail">
					{computed ? (
						<span title="Its value is worked out in code, so a hand cannot write it">ƒ</span>
					) : reach === "row" ? null : (
						<span
							className={cn(
								"flex size-3 transition-[opacity,rotate] duration-fast [&>svg]:size-full",
								open
									? "rotate-90 opacity-100"
									: "opacity-0 group-hover/knob:opacity-100 group-focus-visible/knob:opacity-100",
							)}
						>
							<ChevronIcon />
						</span>
					)}
				</span>
			</div>
			{computed && open ? null : open && reach === "opens" ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: Escape inside the editor backs out to its row
				<div
					className="flex flex-col gap-2 px-3 pt-1 pb-3"
					onKeyDown={(event) => {
						if (event.key !== "Escape" || event.defaultPrevented) return;
						event.stopPropagation();
						close();
					}}
				>
					<KnobEditor {...control} />
					{knob.shared === null ? null : (
						<span className="flex items-center gap-1.5 text-tertiary type-detail">
							<SharedMark />
							<span className="truncate">{knob.shared}</span>
							<span className="ml-auto shrink-0">every frame</span>
						</span>
					)}
				</div>
			) : null}
			{open && reach === "popover" && self.current !== null ? (
				<Beside
					row={self.current}
					label={knob.key}
					onClose={close}
					onCancel={() => value !== undefined && tune(value, "cancel")}
				>
					<Choices {...control} />
				</Beside>
			) : null}
			{refused === null ? null : (
				<div data-knob-refusal={refused.code} className="px-3 pb-1.5 text-secondary type-detail">
					{refused.says}
				</div>
			)}
		</div>
	);
}

/** the popover's width, a menu's */
const BESIDE_WIDTH = 224;

/** A list too long for the rail, open beside the row it belongs to, over the canvas. */
function Beside({
	row,
	label,
	onClose,
	onCancel,
	children,
}: {
	row: HTMLElement;
	label: string;
	onClose: () => void;
	/** what was tried on goes back */
	onCancel: () => void;
	children: ReactNode;
}) {
	const panel = useRef<HTMLDivElement | null>(null);
	const rowRef = useRef(row);
	rowRef.current = row;
	useCloseOnPressAway(true, onClose, panel, rowRef);
	// the keyboard comes along: the chosen option takes the focus as the list opens
	useEffect(() => {
		const options = [...(panel.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
		(options.find((option) => option.getAttribute("aria-selected") === "true") ?? options[0])?.focus();
	}, []);
	const rect = row.getBoundingClientRect();
	return (
		<Popover
			ref={panel}
			pad="sm"
			aria-label={label}
			style={{
				left: Math.max(8, rect.left - BESIDE_WIDTH - 8),
				top: Math.max(8, Math.min(rect.top, innerHeight - 320)),
				width: BESIDE_WIDTH,
			}}
			className="fixed z-50 max-h-80 overflow-y-auto"
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
					onClose();
				} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const options = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=option]")];
					const at = options.indexOf(document.activeElement as HTMLElement);
					options[Math.min(options.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
				}
			}}
		>
			{children}
		</Popover>
	);
}

/* ---------- the foot ---------- */

function Foot({ knobs, count }: { knobs: FrameKnobs; count: number }) {
	const words = knobs.status === null ? null : statusWords(knobs.status);
	return (
		<StatusLine role="status" aria-live="polite" data-knobs-status="" className="px-3">
			<span className={cn("min-w-0 truncate", words === null ? "text-tertiary" : "text-primary")}>
				{words?.says ?? `${count} knobs`}
			</span>
			{words === null || words.aside === "" ? null : <span className="shrink-0 text-tertiary">{words.aside}</span>}
		</StatusLine>
	);
}
