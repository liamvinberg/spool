import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { chainOf, ELEMENTS, elementOf, tokens } from "shared/lib/spool/properties-model";
import { cn } from "shared/lib/utils";
import { PropertiesCart } from "shared/ui/demo/kaffe-properties-cart";
import { type Acts, type Geometry, Inspector, type Pick, type Reading, type Rect } from "./inspector";

/**
 * The properties panel as a two-column inspector: every property is one row,
 * the CSS name on the left, the one control that fits it on the right, hairline
 * under each row, sections only a thin divider with a CSS-named heading.
 * A devtools Computed pane at Figma's density.
 *
 * What to feel: that nothing is translated. The rows say `flex-direction`,
 * `padding-left`, `border-radius`, `line-height`, and the values say `flex-col`,
 * `4`, `rounded-md`, `leading-base`, which is what lands in the file. Nothing in
 * the panel explains itself: a refused row is grey and the reason is four words,
 * once. Named tokens are picked from a menu of the project's own token set with
 * the computed value beside every name, so a colour and a radius change the same
 * way a number does. Tab walks the rows, arrows step, shift steps by ten, Enter
 * commits, Esc reverts.
 *
 * The left is the smallest thing that makes the panel felt: kaffe's cart, live,
 * plus its source elements as a list. Click either. Editing re-lays the cart and
 * lights the spliced token on the className line at the bottom of the panel.
 */

const INITIAL_FRAME: Geometry = { x: 1740, y: 96, w: 300, h: 470 };
const STAGE_H = 470;

type Snapshot = { classes: Record<string, string>; texts: Record<string, string>; frame: Geometry };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: INITIAL_FRAME,
};

const ORIGIN = new Map(ELEMENTS.map((element) => [element.id, element.className ?? ""]));

export default function PanelGridFrame() {
	const [state, setState] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<readonly Snapshot[]>([]);
	const [selection, setSelection] = useState<Pick | null>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const stageRef = useRef<HTMLDivElement | null>(null);
	const cartRef = useRef<HTMLDivElement | null>(null);

	const measure = useCallback(() => {
		const stage = stageRef.current;
		const cart = cartRef.current;
		if (stage === null || cart === null) return;
		const origin = stage.getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const node of cart.querySelectorAll<HTMLElement>("[data-node]")) {
			const id = node.dataset.node ?? "";
			const key = node.dataset.key ?? id;
			const rect = node.getBoundingClientRect();
			next.set(`${id}:${key}`, { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height });
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(measure, [measure, state]);

	const commit = useCallback((change: (snapshot: Snapshot) => Snapshot) => {
		setState((current) => {
			const next = change(current);
			if (next === current) return current;
			setHistory((stack) => [...stack, current]);
			return next;
		});
	}, []);

	const undo = useCallback(() => {
		setHistory((stack) => {
			const last = stack[stack.length - 1];
			if (last === undefined) return stack;
			setState(last);
			return stack.slice(0, -1);
		});
	}, []);

	const ascend = useCallback(() => {
		setSelection((held) => {
			if (held === null) return null;
			const element = elementOf(held.id);
			if (element === undefined || element.parent === null) return held;
			const parent = elementOf(element.parent);
			return parent === undefined ? held : { id: parent.id, key: parent.mapped === undefined ? parent.id : held.key };
		});
	}, []);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			const typing =
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement;
			if (typing) return;
			if (event.key === "Escape") ascend();
			if ((event.metaKey || event.ctrlKey) && event.key === "z") {
				event.preventDefault();
				undo();
			}
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [ascend, undo]);

	const pickFrom = (target: EventTarget | null): Pick | null => {
		let node = target instanceof Element ? target : null;
		while (node !== null && cartRef.current?.contains(node) === true) {
			const id = node.getAttribute("data-node");
			if (id !== null) return { id, key: node.getAttribute("data-key") ?? id };
			node = node.parentElement;
		}
		return null;
	};

	const element = selection === null ? null : (elementOf(selection.id) ?? null);
	const origin = element === null ? "" : (ORIGIN.get(element.id) ?? "");
	const reading: Reading | null =
		element === null || selection === null
			? null
			: {
					element,
					pick: selection,
					className: state.classes[element.id] ?? "",
					text:
						state.texts[element.id] ??
						(element.text !== undefined && "literal" in element.text ? element.text.literal : null),
					box: boxes.get(`${selection.id}:${selection.key}`) ?? { x: 0, y: 0, w: 0, h: 0 },
					frame: state.frame,
					origin,
					original: new Set(tokens(origin)),
				};

	const acts: Acts = {
		setClass: (id, next) =>
			commit((snapshot) => ({ ...snapshot, classes: { ...snapshot.classes, [id]: next(snapshot.classes[id] ?? null) } })),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
		setFrame: (patch) => commit((snapshot) => ({ ...snapshot, frame: { ...snapshot.frame, ...patch } })),
		select: (pick) => setSelection(pick),
		undo,
		canUndo: history.length > 0,
	};

	const selected = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const hovered =
		hover === null || (selection !== null && hover.id === selection.id && hover.key === selection.key)
			? undefined
			: boxes.get(`${hover.id}:${hover.key}`);
	const kin =
		selection === null || element?.mapped === undefined
			? []
			: [...boxes.entries()].filter(([key]) => key.startsWith(`${selection.id}:`) && key !== `${selection.id}:${selection.key}`);

	return (
		<div className="flex h-full w-full bg-canvas">
			<div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5">
				<button
					type="button"
					onClick={() => setSelection({ id: "pay", key: "pay" })}
					className="flex h-4 shrink-0 cursor-pointer items-center gap-2 self-center font-mono text-sm leading-4"
					style={{ width: state.frame.w }}
				>
					<span className={cn(selection?.id === "screen" ? "text-thread" : "text-muted")}>cart</span>
					<span className="ml-auto font-mono text-2xs text-muted/50 leading-3">
						{state.frame.w} × {state.frame.h}
					</span>
				</button>

				<div ref={stageRef} className="relative shrink-0 overflow-hidden" style={{ height: STAGE_H }}>
					<div className="flex h-full justify-center">
						<div
							ref={cartRef}
							onPointerMove={(event) => setHover(pickFrom(event.target))}
							onPointerLeave={() => setHover(null)}
							onClick={(event) => {
								const pick = pickFrom(event.target);
								if (pick !== null) setSelection(pick);
							}}
							className="shrink-0 overflow-hidden rounded-[10px] border border-border bg-bg"
							style={{ width: state.frame.w, height: state.frame.h }}
						>
							<PropertiesCart classes={state.classes} texts={state.texts} elements={ELEMENTS} />
						</div>
					</div>
					<div className="pointer-events-none absolute inset-0">
						{hovered === undefined ? null : (
							<span
								className="absolute rounded-[3px] border border-thread/50"
								style={{ left: hovered.x - 2, top: hovered.y - 2, width: hovered.w + 4, height: hovered.h + 4 }}
							/>
						)}
						{kin.map(([key, rect]) => (
							<span
								key={key}
								className="absolute rounded-[3px] border border-thread/25"
								style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }}
							/>
						))}
						{selected === undefined ? null : (
							<span
								className="absolute rounded-[3px] border-[1.5px] border-thread"
								style={{ left: selected.x - 2, top: selected.y - 2, width: selected.w + 4, height: selected.h + 4 }}
							/>
						)}
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto border-border border-t pt-1.5">
					{ELEMENTS.map((entry) => {
						const depth = chainOf(entry.id).length - 1;
						const on = selection?.id === entry.id;
						return (
							<button
								key={entry.id}
								type="button"
								onClick={() =>
									setSelection({ id: entry.id, key: entry.mapped === undefined ? entry.id : "brygg" })
								}
								onPointerEnter={() =>
									setHover({ id: entry.id, key: entry.mapped === undefined ? entry.id : "brygg" })
								}
								onPointerLeave={() => setHover(null)}
								className={cn(
									"flex h-5 w-full cursor-pointer items-center gap-2 rounded-xs px-1.5 font-mono text-2xs leading-3 focus:outline-none focus-visible:bg-surface",
									on ? "bg-surface" : "hover:bg-surface/60",
								)}
								style={{ paddingLeft: 6 + depth * 12 }}
							>
								<span className={on ? "text-thread" : "text-text"}>{entry.name}</span>
								<span className="text-muted/50">{entry.tag}</span>
								{entry.mapped === undefined ? null : <span className="text-muted/50">× {entry.mapped}</span>}
								<span className="ml-auto text-muted/40">{entry.line}</span>
							</button>
						);
					})}
				</div>
			</div>

			<Inspector reading={reading} acts={acts} />
		</div>
	);
}
